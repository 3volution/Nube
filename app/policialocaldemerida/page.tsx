'use client';

import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/app/config/version';

interface Connector {
  id: string;
  visualRef?: string;
  status: string;
  status_changed_at: string;
}

interface Station {
  id: number;
  name: string;
  connectors: Connector[];
}

export default function PoliciaLocalPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sanctionableData, setSanctionableData] = useState<Array<{
    stationName: string;
    stationId: number;
    connector: Connector;
    durationMinutes: number;
    formattedTime: string;
  }>>([]);

  // Orden personalizado de estaciones
  const STATION_ORDER = {
    828537: 0, // Estacion Bus
    828524: 1, // Avda. Roma
    828534: 2, // Calle Almendralejo (1)
    828535: 3, // Calle Almendralejo (2)
    828523: 4, // Plaza Xirgu
    828538: 5  // Avda. del Prado
  };

  const STATION_NAMES = {
    '828537': 'Estacion Bus',
    '828524': 'Avda. Roma',
    '828534': 'Calle Almendralejo',
    '828535': 'Calle Almendralejo',
    '828523': 'Plaza Xirgu',
    '828538': 'Avda. del Prado'
  };

  const fetchData = async () => {
    try {
      const response = await fetch('/api/stations');
      if (response.ok) {
        const stationsData = await response.json();
        const sorted = (stationsData.stations || []).sort((a, b) => 
          (STATION_ORDER[a.id as keyof typeof STATION_ORDER] ?? 999) - 
          (STATION_ORDER[b.id as keyof typeof STATION_ORDER] ?? 999)
        );
        setStations(sorted);
      }
      setError(null);
    } catch (err) {
      console.error('[v0] Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  // Función para calcular tiempo transcurrido
  const formatTime = (isoString: string | null): string => {
    if (!isoString) return 'Sin datos';
    try {
      const mins = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
      if (mins < 1) return 'Hace segundos';
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    } catch (e) {
      return 'Error';
    }
  };

  // Función para detectar sancionables (> 120 minutos) Y OCUPADOS
  const getSanctionableConnectors = () => {
    const sanctionable: typeof sanctionableData = [];

    stations.forEach(station => {
      station.connectors?.forEach(connector => {
        // Solo si el conector está OCUPADO actualmente
        if (connector.status !== 'FREE' && connector.status !== 'AVAILABLE') {
          // Calcular tiempo desde que cambió de estado
          const startTime = new Date(connector.status_changed_at).getTime();
          const durationMinutes = Math.floor((Date.now() - startTime) / 60000);

          // Solo si excede 120 minutos (2 horas)
          if (durationMinutes > 120) {
            const stationName = STATION_NAMES[station.id as keyof typeof STATION_NAMES] || station.name;
            sanctionable.push({
              stationName,
              stationId: station.id,
              connector,
              durationMinutes,
              formattedTime: formatTime(connector.status_changed_at)
            });
          }
        }
      });
    });

    return sanctionable.sort((a, b) => b.durationMinutes - a.durationMinutes);
  };

  // Actualizar cada segundo para ver tiempo real
  useEffect(() => {
    const timer = setInterval(() => {
      setSanctionableData(getSanctionableConnectors());
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [stations]);

  // Cargar datos iniciales
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-recarga cada 60 segundos
  useEffect(() => {
    const reloadInterval = setInterval(() => {
      window.location.reload();
    }, 60000);
    return () => clearInterval(reloadInterval);
  }, []);

  const totalSanctionable = sanctionableData.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 to-red-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🚨 Sancionables en Tiempo Real
          </h1>
          <p className="text-red-200">Cargadores que exceden el límite de 2 horas - Policía Local</p>
          <div className="text-sm text-red-300 mt-2">
            Versión: {APP_VERSION}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-700 border border-red-600 text-red-50 px-4 py-3 rounded-lg mb-6">
            Error conectando: {error}
          </div>
        )}

        {/* Stats Bar */}
        <div className="bg-red-800 bg-opacity-60 rounded-lg p-4 mb-6 border border-red-700">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🚨</span>
              <div>
                <p className="text-red-200 text-sm">Total Sancionables</p>
                <p className="text-white font-bold text-2xl">{totalSanctionable}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">⏰</span>
              <div>
                <p className="text-red-200 text-sm">Hora Actual</p>
                <p className="text-white font-mono">{currentTime.toLocaleTimeString('es-ES')}</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        ) : (
          <>
            {totalSanctionable === 0 ? (
              <div className="bg-green-900 bg-opacity-40 border border-green-700 rounded-lg p-8 text-center">
                <p className="text-green-200 text-xl font-bold">✅ Sin sancionables detectados</p>
                <p className="text-green-300 text-sm mt-2">Todos los cargadores están dentro del límite permitido</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sanctionableData.map((item, idx) => {
                  const mins = item.durationMinutes;
                  const hours = Math.floor(mins / 60);
                  const remainingMins = mins % 60;
                  
                  return (
                    <div
                      key={idx}
                      className="bg-red-800 bg-opacity-70 border-2 border-red-600 rounded-lg p-4 shadow-lg shadow-red-900/50 transform transition hover:scale-105"
                      style={{
                        animation: 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        boxShadow: '0 0 30px rgba(220, 38, 38, 0.6)'
                      }}
                    >
                      <div className="flex items-start gap-4">
                        {/* Icono de alerta pulsante */}
                        <div className="text-4xl flex-shrink-0 animate-bounce">🚨</div>

                        {/* Información principal */}
                        <div className="flex-1">
                          <div className="flex items-baseline justify-between mb-2">
                            <h3 className="text-white font-bold text-xl">
                              {item.stationName}
                            </h3>
                            <span className="text-red-200 text-sm">
                              ID: {item.connector.visualRef || item.connector.id}
                            </span>
                          </div>

                          {/* Tiempo excedido */}
                          <div className="bg-red-700 bg-opacity-50 rounded p-2 mb-2">
                            <p className="text-red-100 text-sm">
                              <span className="font-bold text-lg">{hours}h {remainingMins}m</span>
                              <span className="ml-2 text-red-200">
                                (Excedido por {hours - 2}h {remainingMins}m)
                              </span>
                            </p>
                          </div>

                          {/* Estado y tiempo */}
                          <div className="flex gap-4 text-sm">
                            <div>
                              <p className="text-red-200">Estado:</p>
                              <p className="text-white font-bold">
                                {item.connector.status === 'OCCUPIED' ? 'OCUPADO' : item.connector.status}
                              </p>
                            </div>
                            <div>
                              <p className="text-red-200">Ocupando desde hace:</p>
                              <p className="text-white font-bold">{item.formattedTime}</p>
                            </div>
                          </div>
                        </div>

                        {/* Indicador de severidad */}
                        <div className="text-right flex flex-col items-end gap-2">
                          <div className="bg-red-600 px-3 py-1 rounded-full">
                            <p className="text-white font-bold text-sm">⚠️ CRÍTICO</p>
                          </div>
                          <div className="text-3xl animate-pulse">🚗</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer con información de actualización */}
            <div className="mt-8 bg-red-950 bg-opacity-50 rounded-lg p-4 border border-red-800 text-center">
              <p className="text-red-300 text-sm">
                Última actualización: {new Date().toLocaleTimeString('es-ES')}
              </p>
              <p className="text-red-400 text-xs mt-1">
                Se actualiza automáticamente cada segundo
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
