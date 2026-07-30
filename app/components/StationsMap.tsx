'use client';

import { useEffect, useRef } from 'react';

// Coordenadas reales de las estaciones de carga de Mérida (verificadas vía Google Maps)
const STATION_COORDS: Record<number, { lat: number; lng: number }> = {
  828537: { lat: 38.9140994, lng: -6.3572276 }, // Estacion Bus - Av. de la Libertad
  828524: { lat: 38.9157181, lng: -6.3484752 }, // Avda. Roma
  828523: { lat: 38.9169339, lng: -6.3393681 }, // Plaza Xirgu
  828534: { lat: 38.9196407, lng: -6.3441762 }, // Calle Almendralejo (1) - Zunder
  828535: { lat: 38.9199500, lng: -6.3438500 }, // Calle Almendralejo (2) - ligeramente desplazado para evitar solapamiento
  828538: { lat: 38.9241077, lng: -6.3671352 }, // Avda. del Prado
};

interface Connector {
  id: number | string;
  visualRef?: string;
  status: string;
  status_changed_at?: string;
}

interface Station {
  id: number;
  name: string;
  connectors: Connector[];
}

interface StationsMapProps {
  stations: Station[];
  hasOvertimeCharges: (connector: Connector) => boolean;
}

function getMinutesSince(timestamp?: string): number {
  if (!timestamp) return 0;
  try {
    return Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  } catch {
    return 0;
  }
}

function getStationAlertLevel(station: Station, hasOvertimeCharges: (c: Connector) => boolean) {
  const overtimeConnectors = station.connectors.filter(c => hasOvertimeCharges(c));
  const occupiedConnectors = station.connectors.filter(
    c => c.status === 'OCCUPIED'
  );
  if (overtimeConnectors.length > 0) return 'critical'; // >2h
  if (occupiedConnectors.length > 0) return 'occupied';
  return 'free';
}

export default function StationsMap({ stations, hasOvertimeCharges }: StationsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;

    // Inicializar el mapa solo una vez
    const initMap = async () => {
      const L = (await import('leaflet')).default;

      // Fix icono por defecto de Leaflet en Next.js
      // @ts-ignore
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      if (!mapInstanceRef.current && mapRef.current) {
        const map = L.map(mapRef.current, {
          center: [38.9185, -6.3500],
          zoom: 14,
          zoomControl: true,
          scrollWheelZoom: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Actualizar marcadores cuando cambian las estaciones
  useEffect(() => {
    if (typeof window === 'undefined' || !mapInstanceRef.current) return;

    const updateMarkers = async () => {
      const L = (await import('leaflet')).default;
      const map = mapInstanceRef.current;
      if (!map) return;

      // Limpiar marcadores anteriores
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      stations.forEach(station => {
        const coords = STATION_COORDS[station.id];
        if (!coords) return;

        const alertLevel = getStationAlertLevel(station, hasOvertimeCharges);
        const overtimeConnectors = station.connectors.filter(c => hasOvertimeCharges(c));
        const occupiedCount = station.connectors.filter(c => c.status === 'OCCUPIED').length;
        const freeCount = station.connectors.filter(
          c => c.status === 'FREE' || c.status === 'AVAILABLE'
        ).length;

        // Colores según estado
        const colors = {
          critical: { bg: '#ef4444', border: '#991b1b', text: '#ffffff', pulse: true },
          occupied: { bg: '#f59e0b', border: '#92400e', text: '#ffffff', pulse: false },
          free:     { bg: '#22c55e', border: '#15803d', text: '#ffffff', pulse: false },
        };
        const color = colors[alertLevel];

        // Pulse animation CSS solo para crítico
        const pulseStyle = color.pulse
          ? `
            animation: markerPulse 0.8s ease-in-out infinite alternate;
            box-shadow: 0 0 0 0 rgba(239,68,68,0.7);
          `
          : '';

        // Icono SVG personalizado
        const iconHtml = `
          <div style="
            position: relative;
            width: 48px;
            height: 48px;
          ">
            ${color.pulse ? `
              <div style="
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 64px; height: 64px;
                border-radius: 50%;
                background: rgba(239,68,68,0.3);
                animation: markerRing 1s ease-out infinite;
              "></div>
              <div style="
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 52px; height: 52px;
                border-radius: 50%;
                background: rgba(239,68,68,0.15);
                animation: markerRing 1s ease-out infinite 0.3s;
              "></div>
            ` : ''}
            <div style="
              position: absolute;
              top: 50%; left: 50%;
              transform: translate(-50%, -50%);
              width: 44px; height: 44px;
              background: ${color.bg};
              border: 3px solid ${color.border};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 13px;
              color: ${color.text};
              box-shadow: 0 4px 12px rgba(0,0,0,0.4);
              ${color.pulse ? 'box-shadow: 0 0 20px rgba(239,68,68,0.9), 0 4px 12px rgba(0,0,0,0.4);' : ''}
              font-family: monospace;
            ">
              ${alertLevel === 'critical' ? '⚠' : '⚡'}
            </div>
          </div>
        `;

        const icon = L.divIcon({
          html: iconHtml,
          className: '',
          iconSize: [48, 48],
          iconAnchor: [24, 24],
          popupAnchor: [0, -28],
        });

        // Contenido del popup
        const connectorsHtml = station.connectors
          .map(c => {
            const isOvertime = hasOvertimeCharges(c);
            const minutes = getMinutesSince(c.status_changed_at);
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
            const statusLabel =
              c.status === 'FREE' || c.status === 'AVAILABLE' ? 'LIBRE' :
              c.status === 'OCCUPIED' ? 'OCUPADO' : 'FUERA';
            const statusColor =
              c.status === 'FREE' || c.status === 'AVAILABLE' ? '#22c55e' :
              isOvertime ? '#ef4444' : '#f59e0b';
            return `
              <div style="
                display: flex; align-items: center; justify-content: space-between;
                padding: 4px 6px; margin: 2px 0; border-radius: 4px;
                background: rgba(255,255,255,0.05);
                ${isOvertime ? 'border-left: 3px solid #ef4444;' : ''}
              ">
                <span style="font-size:11px; color:#94a3b8;">
                  ${c.visualRef || c.id}
                </span>
                <span style="font-size:11px; font-weight:bold; color:${statusColor};">
                  ${statusLabel}
                </span>
                ${c.status === 'OCCUPIED' ? `
                  <span style="font-size:11px; color:${isOvertime ? '#ef4444' : '#cbd5e1'};">
                    ${timeStr}${isOvertime ? ' ⚠' : ''}
                  </span>
                ` : ''}
              </div>
            `;
          })
          .join('');

        const popupHtml = `
          <div style="
            background: #1e293b; color: #f1f5f9;
            border-radius: 8px; padding: 10px;
            min-width: 200px; font-family: monospace;
          ">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 6px; color: #f8fafc;">
              ${station.name}
            </div>
            <div style="display:flex; gap:8px; margin-bottom:8px; font-size:11px;">
              <span style="color:#22c55e;">● ${freeCount} libres</span>
              <span style="color:#f59e0b;">● ${occupiedCount} ocupados</span>
              ${overtimeConnectors.length > 0 ? `<span style="color:#ef4444;">⚠ ${overtimeConnectors.length} >2h</span>` : ''}
            </div>
            <div>${connectorsHtml}</div>
          </div>
        `;

        const marker = L.marker([coords.lat, coords.lng], { icon })
          .addTo(map)
          .bindPopup(popupHtml, {
            maxWidth: 260,
            className: 'stations-map-popup',
          });

        markersRef.current.push(marker);
      });
    };

    // Esperar a que el mapa esté inicializado
    const timer = setTimeout(updateMarkers, 300);
    return () => clearTimeout(timer);
  }, [stations, hasOvertimeCharges]);

  return (
    <>
      <style>{`
        @keyframes markerRing {
          0%   { transform: translate(-50%, -50%) scale(0.8); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
        }
        .stations-map-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .stations-map-popup .leaflet-popup-content {
          margin: 0 !important;
        }
        .stations-map-popup .leaflet-popup-tip-container {
          display: none;
        }
        .leaflet-container {
          background: #0f172a;
          border-radius: 8px;
        }
      `}</style>
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
      />
      <div
        ref={mapRef}
        style={{ width: '100%', height: '400px', borderRadius: '8px' }}
      />
    </>
  );
}
