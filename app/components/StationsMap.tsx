'use client';

import { useEffect, useRef, useMemo } from 'react';

// Coordenadas verificadas directamente de Google Maps
const STATION_COORDS: Record<number, { lat: number; lng: number; label: string }> = {
  828537: { lat: 38.9140994, lng: -6.3572276, label: 'Bus' },
  828524: { lat: 38.9157181, lng: -6.3484752, label: 'Roma' },
  828523: { lat: 38.9169339, lng: -6.3393681, label: 'Xirgu' },
  828534: { lat: 38.9196407, lng: -6.3441762, label: 'Alm. 1' },
  828535: { lat: 38.9196407, lng: -6.3451000, label: 'Alm. 2' },
  828538: { lat: 38.9241077, lng: -6.3671352, label: 'Prado' },
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

function getStationAlertLevel(station: Station, hasOvertime: (c: Connector) => boolean) {
  if (station.connectors.some(c => hasOvertime(c))) return 'critical';
  if (station.connectors.some(c => c.status === 'OCCUPIED')) return 'occupied';
  return 'free';
}

export default function StationsMap({ stations, hasOvertimeCharges }: StationsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const popupRef = useRef<any>(null);

  // Datos de estaciones con coordenadas y nivel de alerta
  const stationData = useMemo(() => {
    return stations
      .map(station => {
        const coords = STATION_COORDS[station.id];
        if (!coords) return null;
        const alertLevel = getStationAlertLevel(station, hasOvertimeCharges);
        const occupiedCount = station.connectors.filter(c => c.status === 'OCCUPIED').length;
        const freeCount = station.connectors.filter(c => c.status === 'FREE' || c.status === 'AVAILABLE').length;
        const overtimeConnectors = station.connectors.filter(c => hasOvertimeCharges(c));
        return { station, coords, alertLevel, occupiedCount, freeCount, overtimeConnectors };
      })
      .filter(Boolean) as NonNullable<ReturnType<typeof stationData[0]>>[];
  }, [stations, hasOvertimeCharges]);

  // Inicializar mapa solo una vez
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || mapInstanceRef.current) return;

    let destroyed = false;

    const init = async () => {
      const maplibre = await import('maplibre-gl');
      if (destroyed || !mapRef.current) return;

      // Estilo oscuro moderno gratuito - MapTiler Basic Dark (sin token para OSM)
      const map = new maplibre.Map({
        container: mapRef.current,
        style: {
          version: 8,
          sources: {
            'osm': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors',
              maxzoom: 19,
            },
            'carto-dark': {
              type: 'raster',
              tiles: [
                'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              ],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors © CARTO',
              maxzoom: 19,
            },
          },
          layers: [
            {
              id: 'carto-dark-layer',
              type: 'raster',
              source: 'carto-dark',
              minzoom: 0,
              maxzoom: 22,
            },
          ],
        },
        center: [-6.3500, 38.9185],
        zoom: 13.5,
        attributionControl: false,
      });

      map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-right');

      // Deshabilitar scroll zoom en móvil para evitar conflictos
      map.scrollZoom.disable();

      mapInstanceRef.current = map;
    };

    init();

    return () => {
      destroyed = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Actualizar marcadores cuando cambian las estaciones
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateMarkers = async () => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const maplibre = await import('maplibre-gl');

      // Eliminar marcadores y popup previos
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }

      stationData.forEach(({ station, coords, alertLevel, occupiedCount, freeCount, overtimeConnectors }) => {
        const isCritical = alertLevel === 'critical';
        const fillColor  = isCritical ? '#ef4444' : '#3b82f6';
        const label      = STATION_COORDS[station.id]?.label ?? '';

        // Wrapper externo: tamaño fijo, cursor pointer
        const el = document.createElement('div');
        el.style.cssText = 'cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:2px;';

        // Anillos pulsantes solo para crítico
        const rings = isCritical ? `
          <span class="ring ring1" style="
            position:absolute; inset:0;
            border-radius:50%; border:2px solid #ef4444;
            animation:ringPulse 1.4s ease-out infinite;
          "></span>
          <span class="ring ring2" style="
            position:absolute; inset:0;
            border-radius:50%; border:2px solid #ef4444;
            animation:ringPulse 1.4s ease-out infinite 0.5s;
          "></span>
        ` : '';

        // Círculo principal como inline-block para que se ancle bien
        const dot = document.createElement('div');
        dot.style.cssText = `
          position: relative;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: ${fillColor};
          border: 3px solid ${isCritical ? '#7f1d1d' : '#1e3a8a'};
          box-shadow: 0 0 12px ${isCritical ? 'rgba(239,68,68,0.7)' : 'rgba(59,130,246,0.5)'}, 0 2px 6px rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        `;
        dot.innerHTML = rings;

        // Etiqueta debajo del círculo
        const lbl = document.createElement('div');
        lbl.style.cssText = `
          background: rgba(0,0,0,0.85);
          color: #f1f5f9;
          font-size: 9px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 3px;
          white-space: nowrap;
          font-family: system-ui, sans-serif;
          border: 1px solid rgba(255,255,255,0.15);
          letter-spacing: 0.3px;
        `;
        lbl.textContent = label;

        el.appendChild(dot);
        el.appendChild(lbl);

        // Popup al hacer clic
        const connectorsHtml = station.connectors
          .sort((a, b) => {
            const aScore = hasOvertimeCharges(a) ? 2 : a.status === 'OCCUPIED' ? 1 : 0;
            const bScore = hasOvertimeCharges(b) ? 2 : b.status === 'OCCUPIED' ? 1 : 0;
            return bScore - aScore;
          })
          .map(c => {
            const isOvertime = hasOvertimeCharges(c);
            const minutes = getMinutesSince(c.status_changed_at);
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            const timeStr = c.status === 'OCCUPIED'
              ? (hours > 0 ? `${hours}h ${mins}m` : `${mins}m`)
              : '';
            const isFree = c.status === 'FREE' || c.status === 'AVAILABLE';
            const statusColor = isFree ? '#22c55e' : isOvertime ? '#ef4444' : '#f59e0b';
            const statusLabel = isFree ? 'LIBRE' : c.status === 'OCCUPIED' ? 'OCUPADO' : 'FUERA';
            return `
              <div style="
                display:flex; align-items:center; justify-content:space-between; gap:8px;
                padding:5px 8px; margin:3px 0; border-radius:5px;
                background:rgba(255,255,255,0.06);
                ${isOvertime ? 'border-left:3px solid #ef4444;' : 'border-left:3px solid transparent;'}
              ">
                <span style="font-size:11px;color:#94a3b8;min-width:60px;">${c.visualRef || c.id}</span>
                <span style="font-size:11px;font-weight:700;color:${statusColor};">${statusLabel}</span>
                ${timeStr ? `<span style="font-size:11px;color:${isOvertime ? '#ef4444' : '#64748b'};">${timeStr}${isOvertime ? ' ⚠' : ''}</span>` : '<span></span>'}
              </div>
            `;
          }).join('');

        const popupHtml = `
          <div style="
            background:#0f172a; color:#f1f5f9;
            border-radius:10px; padding:12px;
            min-width:210px; font-family:system-ui,sans-serif;
            border:1px solid rgba(255,255,255,0.1);
            box-shadow:0 8px 32px rgba(0,0,0,0.6);
          ">
            <div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#f8fafc;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;">
              ${station.name}
            </div>
            <div style="display:flex;gap:10px;margin-bottom:8px;font-size:11px;">
              <span style="color:#22c55e;">● ${freeCount} libres</span>
              <span style="color:#f59e0b;">● ${occupiedCount} ocupados</span>
              ${overtimeConnectors.length > 0 ? `<span style="color:#ef4444;font-weight:700;">⚠ ${overtimeConnectors.length} &gt;2h</span>` : ''}
            </div>
            ${connectorsHtml}
          </div>
        `;

        el.addEventListener('click', () => {
          if (popupRef.current) popupRef.current.remove();
          const popup = new maplibre.Popup({
            closeButton: true,
            closeOnClick: true,
            className: 'stations-popup',
            maxWidth: '260px',
            offset: 30,
          })
            .setLngLat([coords.lng, coords.lat])
            .setHTML(popupHtml)
            .addTo(map);
          popupRef.current = popup;
        });

        // anchor:'top' porque el círculo es el primer elemento del flex column
        const marker = new maplibre.Marker({ element: el, anchor: 'top' })
          .setLngLat([coords.lng, coords.lat])
          .addTo(map);

        markersRef.current.push(marker);
      });
    };

    // Si el mapa ya está listo, actualizar inmediatamente
    const map = mapInstanceRef.current;
    if (map) {
      if (map.loaded()) {
        updateMarkers();
      } else {
        map.once('load', updateMarkers);
      }
    } else {
      // Esperar a que se inicialice
      const interval = setInterval(() => {
        if (mapInstanceRef.current) {
          clearInterval(interval);
          const m = mapInstanceRef.current;
          if (m.loaded()) updateMarkers();
          else m.once('load', updateMarkers);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [stationData]);

  return (
    <>
      <style>{`
        @keyframes ringPulse {
          0%   { transform: scale(1);   opacity: 0.8; }
          100% { transform: scale(2.4); opacity: 0;   }
        }
        .stations-popup .maplibregl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          border-radius: 10px !important;
          box-shadow: none !important;
        }
        .stations-popup .maplibregl-popup-tip { display: none; }
        .stations-popup .maplibregl-popup-close-button {
          color: #94a3b8;
          font-size: 18px;
          top: 6px;
          right: 8px;
        }
        .maplibregl-ctrl-attrib { font-size: 9px !important; }
      `}</style>
      <link
        rel="stylesheet"
        href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"
      />
      <div
        ref={mapRef}
        style={{ width: '100%', height: '420px', borderRadius: '8px', background: '#0f172a' }}
      />
    </>
  );
}
