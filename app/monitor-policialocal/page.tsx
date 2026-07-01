'use client';

import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/app/config/version';

export default function PoliciaLocalPage() {
  const [stations, setStations] = useState([]);
  const [stateChanges, setStateChanges] = useState([]);
  const [chargeHistory, setChargeHistory] = useState([]);
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

  const getCarIcon = (connectorId: string, index?: number) => {
    const icons = ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑'];
    if (index !== undefined) {
      return icons[index % icons.length];
    }
    const hash = connectorId.charCodeAt(connectorId.length - 1) || 0;
    return icons[hash % icons.length];
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
        const changes = changesData.changes || [];
        setStateChanges(changes);
        
        // Extraer historial de cargas completadas (transiciones OCCUPIED → FREE)
        const uniqueCharges = new Map();
        changes
          .filter(change => change.new_status === 'FREE' || change.new_status === 'AVAILABLE')
          .forEach(change => {
            const key = `${change.connector_id}-${change.timestamp}`;
            if (!uniqueCharges.has(key)) {
              uniqueCharges.set(key, {
                connector_id: change.connector_id,
                timestamp: change.timestamp,
                isCompleted: true,
                isOverLimit: false
              });
            }
          });
        
        const sortedCharges = Array.from(uniqueCharges.values())
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 200);
        
        setChargeHistory(sortedCharges);
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

  // Obtener TODOS los conectores ocupados
  const allOccupiedConnectors = stations
    .flatMap(station => 
      (station.connectors || []).map(connector => ({
        ...connector,
        stationName: station.name,
        stationId: station.id
      }))
    )
    .filter(connector => connector.status !== 'FREE' && connector.status !== 'AVAILABLE')
    .sort((a, b) => {
      const aDuration = Math.floor((Date.now() - new Date(a.status_changed_at).getTime()) / 60000);
      const bDuration = Math.floor((Date.now() - new Date(b.status_changed_at).getTime()) / 60000);
      return bDuration - aDuration; // Mayor duración primero
    });

  // Identificar cuáles son sancionables
  const sanctionableIds = new Set(
    allOccupiedConnectors
      .filter(c => {
        const durationMinutes = Math.floor((Date.now() - new Date(c.status_changed_at).getTime()) / 60000);
        return durationMinutes > 120;
      })
      .map(c => c.id)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-white text-2xl">Cargando...</div>
      </div>
    );
  }

  return (
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

          {/* Conectores Ocupados (sancionables parpadean) */}
          <div className="grid gap-4 mb-8">
            {allOccupiedConnectors.length > 0 ? (
              allOccupiedConnectors.map((connector, index) => {
                const durationMinutes = Math.floor((Date.now() - new Date(connector.status_changed_at).getTime()) / 60000);
                const excessMinutes = durationMinutes - 120;
                const isSanctionable = sanctionableIds.has(connector.id);
                const bgClass = isSanctionable 
                  ? 'bg-red-900 border-l-4 border-red-500 animate-pulse' 
                  : 'bg-yellow-900/60 border-l-4 border-yellow-600';

                return (
                  <div
                    key={`${connector.id}-${index}`}
                    className={`${bgClass} p-4 rounded`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-white">
                      <div>
                        <span className="text-sm opacity-75">Estación</span>
                        <div className="text-lg font-bold">{connector.stationName}</div>
                      </div>
                      <div>
                        <span className="text-sm opacity-75">ID Conector</span>
                        <div className="text-lg font-bold">{connector.visualRef || connector.id}</div>
                      </div>
                      <div>
                        <span className="text-sm opacity-75">Tiempo Total</span>
                        <div className="text-lg font-bold">{formatTime(connector.status_changed_at)}</div>
                      </div>
                      <div>
                        <span className="text-sm opacity-75">Estado</span>
                        <div className="text-lg font-bold">{isSanctionable ? '⚠️ SANCIONABLE' : '🔌 OCUPADO'}</div>
                      </div>
                      {isSanctionable && (
                        <div>
                          <span className="text-sm opacity-75">Exceso</span>
                          <div className="text-lg font-bold text-yellow-300">+{excessMinutes} min</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-green-900 border-l-4 border-green-500 text-green-100 p-6 rounded text-center text-lg font-bold">
                ✅ No hay conectores ocupados en este momento
              </div>
            )}
          </div>

          {/* Histórico de Cargas */}
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-white mb-4">Cargas Completadas - Histórico</h2>
            <div className="bg-slate-800 rounded-lg overflow-hidden">
              {chargeHistory.length > 0 ? (
                <div className="max-h-96 overflow-y-auto">
                  {chargeHistory.map((charge, idx) => {
                    const timestamp = new Date(charge.timestamp);
                    const timeStr = timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    const dateStr = timestamp.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
                    
                    let showDaySeparator = idx === 0;
                    if (idx > 0) {
                      const prevTimestamp = new Date(chargeHistory[idx - 1].timestamp);
                      const currentDate = new Date(timestamp).toLocaleDateString('es-ES');
                      const prevDate = new Date(prevTimestamp).toLocaleDateString('es-ES');
                      showDaySeparator = currentDate !== prevDate;
                    }
                    
                    const mins = charge.durationMinutes || 0;
                    const durationStr = mins >= 60 
                      ? `${Math.floor(mins / 60)}h ${mins % 60}m` 
                      : `${mins}m`;
                    
                    let bgColor = 'bg-slate-700';
                    if (charge.isCompleted) {
                      bgColor = charge.isOverLimit ? 'bg-red-900/70' : 'bg-green-900/50';
                    }
                    
                    return (
                      <div key={idx}>
                        {showDaySeparator && idx > 0 && (
                          <div className="bg-slate-200 px-3 py-3 flex items-center justify-between border-b-2 border-slate-400">
                            <div className="flex-1">
                              <div className="font-bold text-slate-900 text-sm mb-2">
                                RESUMEN DEL DÍA ANTERIOR - 23:59 HORAS
                              </div>
                              <div className="flex gap-8 text-sm text-slate-800">
                                <div className="flex gap-2">
                                  <span className="font-semibold">Cargas:</span>
                                  <span className="text-green-600 font-bold">{chargeHistory.filter(c => {
                                    const prevDate = new Date(chargeHistory[idx - 1].timestamp).toLocaleDateString('es-ES');
                                    const cDate = new Date(c.timestamp).toLocaleDateString('es-ES');
                                    return cDate === prevDate;
                                  }).length}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="font-semibold">Ocupación:</span>
                                  <span className="text-blue-600 font-bold">-</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-lg">⚠️</span>
                                  <span className="text-red-600 font-bold">{chargeHistory.filter(c => {
                                    const prevDate = new Date(chargeHistory[idx - 1].timestamp).toLocaleDateString('es-ES');
                                    const cDate = new Date(c.timestamp).toLocaleDateString('es-ES');
                                    return cDate === prevDate && c.isOverLimit;
                                  }).length}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <div className={`${bgColor} px-3 py-2 flex items-start gap-2 border-b border-slate-600 last:border-b-0`}>
                          <span className="text-2xl mt-1">{getCarIcon(charge.connector_id, idx)}</span>
                          <div className="flex-1">
                            <div className="font-mono text-sm text-slate-300 flex gap-3 mb-1">
                              <span className="text-slate-400">{dateStr} {timeStr}</span>
                              <span className="text-blue-300 font-bold">ID: {charge.connector_id}</span>
                            </div>
                            <div className="font-mono text-sm flex gap-3 items-center">
                              <span className="text-slate-300">{charge.station_name || '-'}</span>
                              <span className={
                                charge.isOverLimit 
                                  ? 'text-red-400 font-bold' 
                                  : 'text-green-400 font-bold'
                              }>
                                {durationStr}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-slate-700 p-4 text-slate-400 text-center">
                  Sin cargas registradas
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 text-center text-slate-400 text-sm">
            <p>Última actualización: {currentTime.toLocaleString('es-ES')}</p>
            <p>Los datos se actualizan automáticamente cada segundo</p>
          </div>
        </div>
      </div>
  );
}
