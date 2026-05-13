'use client';

import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/app/config/version';

export default function MonitorPage() {
  const [stations, setStations] = useState([]);
  const [stateChanges, setStateChanges] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('estaciones');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

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
      const [stationsRes, changesRes, logsRes] = await Promise.all([
        fetch('/api/stations'),
        fetch('/api/state-changes?limit=200'),
        fetch('/api/logs?limit=100')
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

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData.logs || []);
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

  // Re-renderizar cada segundo para actualizar los tiempos dinámicamente (como en Scriptable)
  useEffect(() => {
    const timer = setInterval(() => {
      setStations(prev => [...prev]); // Forzar re-render sin cambiar data
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  // Función para calcular tiempo transcurrido (igual que en Scriptable)
  const formatTime = (isoString) => {
    if (!isoString) return 'Sin datos';
    try {
      const mins = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
      if (mins < 1) return 'Hace segundos';
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return h > 0 ? `Hace ${h}h ${m}m` : `Hace ${m}m`;
    } catch (e) {
      return 'Error';
    }
  };

  const getStatusColor = (status) => {
    if (status === 'FREE' || status === 'AVAILABLE') {
      return 'bg-green-900 text-green-100 border-l-4 border-green-500';
    }
    if (status === 'OCCUPIED') {
      return 'bg-red-900 text-red-100 border-l-4 border-red-500';
    }
    return 'bg-yellow-900 text-yellow-100 border-l-4 border-yellow-500';
  };

  const getStatusBadge = (status) => {
    if (status === 'FREE' || status === 'AVAILABLE') {
      return 'bg-green-600 text-white';
    }
    if (status === 'OCCUPIED') {
      return 'bg-red-600 text-white';
    }
    return 'bg-yellow-600 text-white';
  };

  const getStateChangeColor = (estadoNuevo) => {
    if (estadoNuevo === 'FREE' || estadoNuevo === 'AVAILABLE') {
      return 'bg-green-50 border-l-4 border-green-500';
    }
    return 'bg-red-50 border-l-4 border-red-500';
  };

  const getStateChangeIcon = (estadoNuevo) => {
    if (estadoNuevo === 'FREE' || estadoNuevo === 'AVAILABLE') {
      return '✅';
    }
    return '🔴';
  };

  // Agrupar estaciones de Calle Almendralejo con IDs específicas
  const displayStations = stations.reduce((acc, station) => {
    if (station.id === 828534) {
      // Encontrar ambas estaciones de Calle Almendralejo (828534 y 828535)
      const almendralejo1 = station;
      const almendralejo2 = stations.find(s => s.id === 828535);
      
      // Conectores que pertenecen a Calle Almendralejo (4 IDs específicas)
      const almendralejoCombined = [];
      if (almendralejo1) almendralejoCombined.push(...almendralejo1.connectors);
      if (almendralejo2) almendralejoCombined.push(...almendralejo2.connectors);
      
      // Buscar otros conectores de Calle Almendralejo por ID
      const otherStationsConnectors = stations
        .filter(s => s.id !== 828534 && s.id !== 828535)
        .flatMap(s => 
          s.connectors.filter(c => 
            ['4543398', '4543399', '4543421', '4543422'].includes(String(c.id))
          )
        );
      
      almendralejoCombined.push(...otherStationsConnectors);
      
      if (almendralejoCombined.length > 0) {
        acc.push({
          ...almendralejo1,
          name: 'Calle Almendralejo',
          connectors: almendralejoCombined,
          conectoresLibres: almendralejoCombined.filter(c => c.status === 'FREE' || c.status === 'AVAILABLE').length,
          conectoresOcupados: almendralejoCombined.filter(c => c.status !== 'FREE' && c.status !== 'AVAILABLE').length
        });
      }
    } else if (station.id !== 828535) {
      acc.push(station);
    }
    return acc;
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">GuardianCharger Mérida <span className="text-lg text-slate-400">{APP_VERSION}</span></h1>
          <p className="text-slate-300">Sistema de monitoreo de cargadores eléctricos de vehículos en tiempo real</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded-lg mb-6">
            Error conectando: {error}
          </div>
        )}

        {/* Controls - REMOVED: Actualizar Ahora, Auto-actualizar, Estaciones, Cambios */}

        {loading ? (
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        ) : (
          <>
            {/* Stations Grid - ALWAYS VISIBLE */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <p className="text-slate-400 text-sm font-mono">⏰ {currentTime.toLocaleTimeString('es-ES')}</p>
                <p className="text-slate-400 text-sm">Última actualización: {displayStations.length > 0 ? displayStations[0].lastCheck : new Date().toLocaleString('es-ES')}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayStations.map(station => (
                  <div
                    key={station.id}
                    className="bg-slate-700 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-white font-bold text-2xl">{station.name}</h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto pr-2">
                      {station.connectors.map((connector, idx) => {
                        const statusChangedDate = connector.status_changed_at ? new Date(connector.status_changed_at) : null;
                        const now = new Date();
                        const diffSeconds = statusChangedDate ? Math.floor((now.getTime() - statusChangedDate.getTime()) / 1000) : null;
                        const offsetSeconds = idx; // El offset es el índice en el array
                        
                        return (
                          <div key={idx} className="space-y-2">
                            <div
                              className={`p-4 rounded-lg border-2 flex flex-col justify-center h-24 ${getStatusColor(connector.status)}`}
                            >
                              <div className="text-xs opacity-75 mb-2">
                                ID: {connector.id}
                              </div>
                              <div className="flex flex-col gap-2">
                                <div className="flex items-baseline gap-3">
                                  <span className="text-2xl sm:text-3xl font-bold">{connector.status_display}</span>
                                  <span className="text-lg sm:text-2xl font-semibold">{formatTime(connector.status_changed_at)}</span>
                                </div>
                              </div>
                            </div>
                            
                            {/* DEBUG PANEL */}
                            <div className="bg-slate-800 rounded p-2 text-xs text-slate-300 border border-slate-600 font-mono space-y-1">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="text-slate-400">Timestamp:</span> {statusChangedDate ? statusChangedDate.toISOString().split('T')[1] : 'N/A'}
                                </div>
                                <div>
                                  <span className="text-slate-400">Índice:</span> {idx}
                                </div>
                                <div className="col-span-2">
                                  <span className="text-slate-400">Timestamp raw:</span> {connector.status_changed_at || 'N/A'}
                                </div>
                                <div>
                                  <span className="text-slate-400">Diff (seg):</span> {diffSeconds !== null ? diffSeconds : 'N/A'}
                                </div>
                                <div>
                                  <span className="text-slate-400">Offset esperado:</span> {offsetSeconds}s
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status Footer */}
            <div className="bg-slate-700 rounded-lg p-4 border border-slate-600">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-slate-400 text-sm">Estado General</p>
                  <p className="text-green-400 font-bold text-lg">Sistema Activo</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Estaciones Monitoreadas</p>
                  <p className="text-blue-400 font-bold text-lg">{displayStations.length}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Total de Conectores</p>
                  <p className="text-purple-400 font-bold text-lg">
                    {displayStations.reduce((sum, s) => sum + s.connectors.length, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Última Actualización</p>
                  <p className="text-slate-300 font-mono text-sm">
                    {new Date().toLocaleTimeString('es-ES')}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

