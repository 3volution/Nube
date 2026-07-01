'use client';

import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/app/config/version';
import { PasswordAuth } from '@/app/components/PasswordAuth';

export default function PoliciaLocalPage() {
  const [stations, setStations] = useState([]);
  const [stateChanges, setStateChanges] = useState([]);
  const [sanctionableCharges, setSanctionableCharges] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Orden personalizado de estaciones
  const STATION_ORDER = {
    828537: 0, // Estacion Bus
    828524: 1, // Avda. Roma
    828534: 2, // Calle Almendralejo (1)
    828535: 3, // Calle Almendralejo (2)
    828523: 4, // Plaza Xirgu
    828538: 5  // Avda. del Prado
  };

  const fetchData = async () => {
    try {
      const [stationsRes, changesRes] = await Promise.all([
        fetch('/api/stations'),
        fetch('/api/state-changes?limit=200')
      ]);

      if (stationsRes.ok) {
        const stationsData = await stationsRes.json();
        const sorted = (stationsData.stations || []).sort((a, b) => 
          (STATION_ORDER[a.id] ?? 999) - (STATION_ORDER[b.id] ?? 999)
        );
        setStations(sorted);
      }

      if (changesRes.ok) {
        const changesData = await changesRes.json();
        setStateChanges(changesData.changes || []);
      }
      setError(null);
    } catch (err) {
      console.error('[v0] Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Re-renderizar cada segundo para actualizar sancionables en tiempo real
  useEffect(() => {
    const timer = setInterval(() => {
      let sanctionable = 0;
      
      stations.forEach(station => {
        station.connectors?.forEach(connector => {
          // Contar conectores ocupados que exceden 2 horas
          if (connector.status !== 'FREE' && connector.status !== 'AVAILABLE') {
            const startTime = new Date(connector.status_changed_at).getTime();
            const durationMinutes = Math.floor((Date.now() - startTime) / 60000);
            if (durationMinutes > 120) {
              sanctionable++;
            }
          }
        });
      });
      
      setSanctionableCharges(sanctionable);
      setStations(prev => [...prev]);
    }, 1000);
    return () => clearInterval(timer);
  }, [stations]);

  // Reloj con segundero activo
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Auto-recarga cada 60 segundos
  useEffect(() => {
    const reloadInterval = setInterval(() => {
      window.location.reload();
    }, 60000);
    return () => clearInterval(reloadInterval);
  }, []);

  // Función para calcular tiempo transcurrido
  const formatTime = (isoString) => {
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

  // Obtener conectores sancionables (ocupados > 2 horas)
  const sanctionableConnectors = stations
    .flatMap(station => 
      (station.connectors || []).map(connector => ({
        ...connector,
        stationName: station.name,
        stationId: station.id
      }))
    )
    .filter(connector => {
      if (connector.status === 'FREE' || connector.status === 'AVAILABLE') return false;
      const startTime = new Date(connector.status_changed_at).getTime();
      const durationMinutes = Math.floor((Date.now() - startTime) / 60000);
      return durationMinutes > 120;
    })
    .sort((a, b) => {
      const aDuration = Math.floor((Date.now() - new Date(a.status_changed_at).getTime()) / 60000);
      const bDuration = Math.floor((Date.now() - new Date(b.status_changed_at).getTime()) / 60000);
      return bDuration - aDuration; // Mayor duración primero
    });

  const validPasswords = ['POLICIALOCAL'];

  if (loading) {
    return (
      <PasswordAuth correctPasswords={validPasswords}>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
          <div className="text-white text-2xl">Cargando...</div>
        </div>
      </PasswordAuth>
    );
  }

  return (
    <PasswordAuth correctPasswords={validPasswords}>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">
              Sancionables - Policía Local <span className="text-lg text-slate-400">{APP_VERSION}</span>
            </h1>
            <p className="text-slate-300 mb-4">Conectores ocupados más de 2 horas</p>
            
            {/* Reloj y contador */}
            <div className="flex items-center justify-between bg-slate-800 bg-opacity-50 p-4 rounded-lg">
              <div className="text-white text-2xl font-mono">
                {currentTime.toLocaleTimeString('es-ES')}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-red-500 text-sm font-bold">SANCIONABLES</div>
                  <div className="text-red-400 text-3xl font-bold">{sanctionableCharges}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-900 border-l-4 border-red-500 text-red-100 p-4 mb-6 rounded">
              Error al cargar datos: {error}
            </div>
          )}

          {/* Conectores Sancionables */}
          <div className="grid gap-4">
            {sanctionableConnectors.length > 0 ? (
              sanctionableConnectors.map((connector, index) => {
                const durationMinutes = Math.floor((Date.now() - new Date(connector.status_changed_at).getTime()) / 60000);
                const excessMinutes = durationMinutes - 120;

                return (
                  <div
                    key={`${connector.id}-${index}`}
                    className="bg-red-900 border-l-4 border-red-500 p-4 rounded animate-pulse"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-white">
                      <div>
                        <span className="text-sm text-red-300">Estación</span>
                        <div className="text-lg font-bold">{connector.stationName}</div>
                      </div>
                      <div>
                        <span className="text-sm text-red-300">ID Conector</span>
                        <div className="text-lg font-bold">{connector.visualRef || connector.id}</div>
                      </div>
                      <div>
                        <span className="text-sm text-red-300">Tiempo Total</span>
                        <div className="text-lg font-bold text-red-200">{formatTime(connector.status_changed_at)}</div>
                      </div>
                      <div>
                        <span className="text-sm text-red-300">Exceso sobre límite</span>
                        <div className="text-lg font-bold text-yellow-300">+{excessMinutes} min</div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-green-900 border-l-4 border-green-500 text-green-100 p-6 rounded text-center text-lg font-bold">
                ✅ No hay conectores sancionables en este momento
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-12 text-center text-slate-400 text-sm">
            <p>Última actualización: {currentTime.toLocaleString('es-ES')}</p>
            <p>Los datos se actualizan automáticamente cada segundo</p>
          </div>
        </div>
      </div>
    </PasswordAuth>
  );
}
