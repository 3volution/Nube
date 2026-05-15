'use client';

import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/app/config/version';

export default function MonitorPage() {
  const [stations, setStations] = useState([]);
  const [stateChanges, setStateChanges] = useState([]);
  const [logs, setLogs] = useState([]);
  const [chargeHistory, setChargeHistory] = useState([]); // Historial de cargas completadas
  const [dailyChargesPerStation, setDailyChargesPerStation] = useState({}); // Cargas por estación hoy
  const [totalDailyCharges, setTotalDailyCharges] = useState(0); // Total cargas hoy
  const [occupancyPerStation, setOccupancyPerStation] = useState({}); // Porcentaje ocupación por estación
  const [globalOccupancy, setGlobalOccupancy] = useState(0); // Porcentaje ocupación global
  const [sanctionableCharges, setSanctionableCharges] = useState(0); // Cargas > 2 horas
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

  // Extraer historial de cargas con estado (en progreso / completada)
  useEffect(() => {
    if (stateChanges.length > 0) {
      // Ordenar cronologicamente
      const sortedByTime = [...stateChanges].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // Agrupar por conector
      const changesByConnector: Record<string, typeof stateChanges> = {};
      sortedByTime.forEach(change => {
        const key = change.connector_id;
        if (!changesByConnector[key]) changesByConnector[key] = [];
        changesByConnector[key].push(change);
      });
      
      // Crear historial distinguiendo entre cargas en progreso y completadas
      const chargesWithStatus: Array<typeof stateChanges[0] & { isCompleted: boolean; durationMinutes: number; isOverLimit: boolean }> = [];
      const processedPairs = new Set<string>(); // Para evitar duplicados (OCCUPIED-FREE pair)
      
      Object.values(changesByConnector).forEach(connectorChanges => {
        // Recorrer los eventos en orden cronologico
        for (let i = 0; i < connectorChanges.length; i++) {
          const change = connectorChanges[i];
          
          // Si es OCUPADO, es inicio de carga
          if (change.new_status !== 'FREE' && change.new_status !== 'AVAILABLE') {
            const startTime = new Date(change.timestamp).getTime();
            let durationMinutes = 0;
            let isCompleted = false;
            let endEvent = null;
            
            // Buscar si hay un FREE posterior
            for (let j = i + 1; j < connectorChanges.length; j++) {
              if (connectorChanges[j].new_status === 'FREE' || connectorChanges[j].new_status === 'AVAILABLE') {
                endEvent = connectorChanges[j];
                break;
              }
            }
            
            if (endEvent) {
              // Carga completada
              const endTime = new Date(endEvent.timestamp).getTime();
              durationMinutes = Math.floor((endTime - startTime) / 60000);
              isCompleted = true;
              
              // Crear ID único para este par OCCUPIED-FREE
              const pairId = `${change.connector_id}-${change.timestamp}-${endEvent.timestamp}`;
              
              // Evitar duplicados
              if (processedPairs.has(pairId)) continue;
              processedPairs.add(pairId);
            } else {
              // Carga en progreso
              durationMinutes = Math.floor((Date.now() - startTime) / 60000);
              isCompleted = false;
            }
            
            chargesWithStatus.push({
              ...change,
              isCompleted,
              durationMinutes,
              isOverLimit: isCompleted && durationMinutes > 120
            });
          }
        }
      });
      
      // Ordenar por fecha descendente, filtrar solo completadas y limitar a 200
      const sortedCharges = chargesWithStatus
        .filter(charge => charge.isCompleted) // Solo mostrar cargas completadas
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 200); // Aumentado de 50 a 200
      
      setChargeHistory(sortedCharges);
      
      // Calcular cargas del dia actual (desde las 00:00)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Mapeo de station_id a nombre de estacion (para hacer match robusto)
      const STATION_ID_TO_NAME = {
        '828537': 'Estacion Bus',
        '828524': 'Avda. Roma',
        '828534': 'Calle Almendralejo (1)',
        '828535': 'Calle Almendralejo (2)',
        '828523': 'Plaza Xirgu',
        '828538': 'Avda. del Prado'
      };
      
      const chargesPerStation = {};
      let totalCharges = 0;
      
      stateChanges.forEach(change => {
        const changeTime = new Date(change.timestamp);
        // Solo contar si es del dia actual Y si pasa a OCUPADO (coche empieza a cargar)
        if (changeTime >= today && change.new_status !== 'FREE' && change.new_status !== 'AVAILABLE') {
          // Usar station_id para hacer match, o station_name como fallback
          const stationName = STATION_ID_TO_NAME[change.station_id] || change.station_name;
          chargesPerStation[stationName] = (chargesPerStation[stationName] || 0) + 1;
          totalCharges++;
        }
      });
      
      setDailyChargesPerStation(chargesPerStation);
      setTotalDailyCharges(totalCharges);
      
      // Calcular porcentaje de ocupación por estación desde las 00:00
      const occupancyByStation = {};
      let totalOccupiedTime = 0;
      let totalTime = 0;
      
      // Agrupar cambios por estación y conector
      const changesByStationConnector = {};
      stateChanges.forEach(change => {
        const changeTime = new Date(change.timestamp);
        if (changeTime >= today) {
          const key = `${change.station_name}|${change.connector_id}`;
          if (!changesByStationConnector[key]) {
            changesByStationConnector[key] = [];
          }
          changesByStationConnector[key].push(change);
        }
      });
      
      // Calcular tiempo por estado para cada conector
      Object.entries(changesByStationConnector).forEach(([key, changes]) => {
        const [stationName] = key.split('|');
        const sortedChanges = changes.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        for (let i = 0; i < sortedChanges.length - 1; i++) {
          const current = new Date(sortedChanges[i].timestamp);
          const next = new Date(sortedChanges[i + 1].timestamp);
          const duration = next - current;
          
          const isOccupied = sortedChanges[i].new_status !== 'FREE' && sortedChanges[i].new_status !== 'AVAILABLE';
          
          if (!occupancyByStation[stationName]) {
            occupancyByStation[stationName] = { occupied: 0, free: 0 };
          }
          
          if (isOccupied) {
            occupancyByStation[stationName].occupied += duration;
            totalOccupiedTime += duration;
          } else {
            occupancyByStation[stationName].free += duration;
          }
          totalTime += duration;
        }
      });
      
      // Calcular porcentajes
      const percentagesByStation = {};
      Object.entries(occupancyByStation).forEach(([station, times]) => {
        const total = times.occupied + times.free;
        percentagesByStation[station] = total > 0 ? Math.round((times.occupied / total) * 100) : 0;
      });
      
      const globalOccupancyPercent = totalTime > 0 ? Math.round((totalOccupiedTime / totalTime) * 100) : 0;
      
      setOccupancyPerStation(percentagesByStation);
      setGlobalOccupancy(globalOccupancyPercent);
    }
  }, [stateChanges]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Re-renderizar cada segundo para actualizar los tiempos dinámicamente (como en Scriptable)
  useEffect(() => {
    const timer = setInterval(() => {
      // Calcular sancionables en tiempo real (conectores OCUPADO > 2 horas)
      let sanctionable = 0;
      stations.forEach(station => {
        station.connectors?.forEach(connector => {
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
      
      setStations(prev => [...prev]); // Forzar re-render sin cambiar data
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

  // Función para generar icono de coche diferente basado en conector ID
  const getCarIcon = (connectorId: string) => {
    const icons = ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑'];
    const hash = connectorId.charCodeAt(connectorId.length - 1) || 0;
    return icons[hash % icons.length];
  };

  // Función para detectar si un conector está OCUPADO y ha excedido 2 horas
  const hasOvertimeCharges = (connector) => {
    // Solo si el conector está OCUPADO actualmente
    if (connector.status === 'FREE' || connector.status === 'AVAILABLE') return false;
    
    // Calcular tiempo desde que cambió de estado
    const startTime = new Date(connector.status_changed_at).getTime();
    const durationMinutes = Math.floor((Date.now() - startTime) / 60000);
    
    // Retornar true solo si excede 120 minutos
    return durationMinutes > 120;
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
      if (almendralejo2) {
        // Excluir 003657 y 003658 de Calle Almendralejo (2)
        const filtered = almendralejo2.connectors.filter(c => {
          const visualRef = c.visualRef || String(c.id);
          return !['003657', '003658'].includes(visualRef);
        });
        almendralejoCombined.push(...filtered);
      }
      
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
          <h1 className="text-4xl font-bold text-white mb-2">HackerCharger Mérida <span className="text-lg text-slate-400">{APP_VERSION}</span></h1>
          <p className="text-slate-300">Sistema de monitoreo de cargadores eléctricos de vehículos en tiempo real</p>
          
          {/* Daily Charge Counter - Total + Occupancy + Sancionables */}
          <div className="mt-4 flex items-center gap-6 text-lg flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔌🚗</span>
              <span className="text-green-400 font-bold">Hoy: {totalDailyCharges} cargas</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📊</span>
              <span className="text-blue-400 font-bold">Ocupación: {globalOccupancy}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              <span className="text-red-500 font-bold">Sancionables: {sanctionableCharges}</span>
            </div>
          </div>
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
                      <div className="text-right">
                        <div className="flex items-center gap-3 justify-end">
                          <div className="flex items-center gap-1 text-purple-400 font-bold text-sm">
                            <span>📊</span>
                            <span>{occupancyPerStation[station.name] || 0}%</span>
                          </div>
                          <div className="flex items-center gap-1 text-yellow-400 font-bold">
                            <span className="text-lg">🔌🚗</span>
                            <span>{dailyChargesPerStation[station.name] || 0}</span>
                          </div>
                        </div>
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
                              className={`p-3 rounded-lg border-2 flex flex-col justify-center h-20 ${getStatusColor(connector.status)} ${
                                hasOvertimeCharges(connector) 
                                  ? 'animate-pulse border-red-500 shadow-lg shadow-red-500' 
                                  : ''
                              }`}
                              style={
                                hasOvertimeCharges(connector)
                                  ? {
                                      animation: 'pulse 0.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                                      boxShadow: '0 0 20px rgba(239, 68, 68, 0.8)'
                                    }
                                  : {}
                              }
                            >
                              <div className="text-xs opacity-75 mb-1">
                                ID: {connector.visualRef || connector.id}
                              </div>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-baseline gap-3">
                                  <span className="text-xl sm:text-2xl font-bold">{connector.status_display}</span>
                                  <span className="text-sm sm:text-lg font-semibold">{formatTime(connector.status_changed_at)}</span>
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

            {/* LOG DE CARGAS */}
            <div className="mt-8">
              <h2 className="text-2xl font-bold text-white mb-4">Historico de Cargas</h2>
              <div className="border border-slate-600 rounded-lg overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  {chargeHistory.length > 0 ? (
                    chargeHistory.map((charge, idx) => {
                      const timestamp = new Date(charge.timestamp);
                      const timeStr = timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                      const dateStr = timestamp.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
                      
                      // Formato duracion: solo minutos o horas:minutos
                      const mins = charge.durationMinutes || 0;
                      const durationStr = mins >= 60 
                        ? `${Math.floor(mins / 60)}h ${mins % 60}m` 
                        : `${mins}m`;
                      
                      // Color de fondo segun estado
                      // Gris: en progreso, Verde: completada, Rojo: completada + mas de 2h
                      let bgColor = 'bg-slate-700'; // Gris - en progreso
                      if (charge.isCompleted) {
                        bgColor = charge.isOverLimit ? 'bg-red-900/70' : 'bg-green-900/50';
                      }
                      
                      return (
                        <div key={idx} className={`${bgColor} px-3 py-2 flex items-start gap-2 border-b border-slate-600 last:border-b-0`}>
                          <span className="text-2xl mt-1">{getCarIcon(charge.connector_id)}</span>
                          <div className="flex-1">
                            {/* Primera línea: fecha, hora, ID */}
                            <div className="font-mono text-sm text-slate-300 flex gap-3 mb-1">
                              <span className="text-slate-400">{dateStr} {timeStr}</span>
                              <span className="text-blue-300 font-bold">ID: {charge.connector_id}</span>
                            </div>
                            {/* Segunda línea: ubicación y tiempo */}
                            <div className="font-mono text-sm flex gap-3 items-center">
                              <span className="text-slate-300">{charge.station_name}</span>
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
                      );
                    })
                  ) : (
                    <div className="bg-slate-800 p-4 text-slate-400 text-center">
                      Sin cargas registradas
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

