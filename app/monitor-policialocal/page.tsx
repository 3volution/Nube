'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { APP_VERSION } from '@/app/config/version';

const StationsMap = dynamic(() => import('@/app/components/StationsMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-96 bg-slate-800 rounded-lg flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
    </div>
  ),
});

export default function PoliciaLocalPage() {
  const [stations, setStations] = useState([]);
  const [stateChanges, setStateChanges] = useState([]);
  const [chargeHistory, setChargeHistory] = useState([]);
  const [sanctionableCharges, setSanctionableCharges] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);


  // Orden personalizado de estaciones: Bus, Roma, Xirgu, Alm1, Alm2, Prado
  const STATION_ORDER = {
    828537: 0, // Estacion Bus
    828524: 1, // Avda. Roma
    828523: 2, // Plaza Xirgu
    828534: 3, // Calle Almendralejo (1)
    828535: 4, // Calle Almendralejo (2)
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

  const calculateSanctionable = (charges: any[]) => {
    // Contar cargas completadas del día actual con durationMinutes > 120
    const today = new Date().toLocaleDateString('es-ES');
    return charges.filter(c => {
      const chargeDate = new Date(c.startTimestamp || c.timestamp).toLocaleDateString('es-ES');
      return chargeDate === today && c.isCompleted && c.durationMinutes > 120;
    }).length;
  };

  const deduplicateSanctionable = (charges: any[]) => {
    // Agrupar por connector_id + station_name
    const groups: Record<string, any[]> = {};
    
    charges.forEach(charge => {
      const key = `${charge.connector_id}-${charge.station_name}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(charge);
    });

    // Para cada grupo, eliminar duplicados que se solapan o tienen finales < 10 min separados
    const deduped: any[] = [];
    
    Object.values(groups).forEach(groupCharges => {
      if (groupCharges.length === 1) {
        deduped.push(groupCharges[0]);
        return;
      }
      
      // Ordenar por startTimestamp ascendente
      const sorted = [...groupCharges].sort((a, b) => 
        new Date(a.startTimestamp).getTime() - new Date(b.startTimestamp).getTime()
      );
      
      // Mantener primera carga, luego verificar solapamientos
      const kept: any[] = [sorted[0]];
      
      for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const last = kept[kept.length - 1];
        
        // Calcular tiempos
        const lastStartMs = new Date(last.startTimestamp).getTime();
        const lastEndMs = new Date(last.timestamp).getTime();
        const currentStartMs = new Date(current.startTimestamp).getTime();
        const currentEndMs = new Date(current.timestamp).getTime();
        
        // Verificar solapamiento: current.start < last.end
        const isOverlapping = currentStartMs < lastEndMs;
        
        // Verificar separación: |current.end - last.end| < 10 min (600000 ms)
        const finalsSeparation = Math.abs(currentEndMs - lastEndMs);
        const isNearFinal = finalsSeparation < 600000;
        
        // Si se solapan O finales están separados < 10 min, es un duplicado
        if (isOverlapping || isNearFinal) {
          // Conservar la de mayor duración
          if (current.durationMinutes > last.durationMinutes) {
            kept[kept.length - 1] = current;
          }
          // Si no, mantener la última (last) sin cambios
        } else {
          // No es duplicado, mantener ambas
          kept.push(current);
        }
      }
      
      deduped.push(...kept);
    });
    
    return deduped;
  };

  const fetchData = async () => {
    try {
      // Filtrar los últimos 30 días en la API (balance memoria/histórico)
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 30);
      const sinceParam = sinceDate.toISOString().split('T')[0];

      const [stationsRes, changesRes] = await Promise.all([
        fetch('/api/stations'),
        fetch(`/api/state-changes?limit=500&since=${sinceParam}`)
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

  // Extraer historial de cargas con estado (EXACTAMENTE igual a monitor)
  useEffect(() => {
    if (stateChanges.length > 0) {
      // Ordenar cronologicamente
      const sortedByTime = [...stateChanges].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // Agrupar por conector
      const changesByConnector: Record<string, any[]> = {};
      sortedByTime.forEach(change => {
        const key = change.connector_id;
        if (!changesByConnector[key]) changesByConnector[key] = [];
        changesByConnector[key].push(change);
      });
      
      // Crear historial solo con cambios OCUPADO→FREE completados
      const chargesWithStatus: any[] = [];
      const processedEventIndices = new Set<string>();
      
      Object.values(changesByConnector).forEach(connectorChanges => {
        for (let i = 0; i < connectorChanges.length; i++) {
          const change = connectorChanges[i];
          const eventKey = `${change.connector_id}-${change.timestamp}-${change.new_status}`;
          if (processedEventIndices.has(eventKey)) continue;
          
          // Solo considerar cambios a OCCUPIED (excluir OUT_OF_SERVICE, UNKNOWN, etc.)
          if (change.new_status === 'OCCUPIED') {
            const startTime = new Date(change.timestamp).getTime();
            let endEvent = null;
            
            for (let j = i + 1; j < connectorChanges.length; j++) {
              if (connectorChanges[j].new_status === 'FREE' || connectorChanges[j].new_status === 'AVAILABLE') {
                endEvent = connectorChanges[j];
                break;
              }
            }
            
            if (endEvent) {
              const endTime = new Date(endEvent.timestamp).getTime();
              const durationMinutes = Math.floor((endTime - startTime) / 60000);
              
              processedEventIndices.add(eventKey);
              processedEventIndices.add(`${change.connector_id}-${endEvent.timestamp}-${endEvent.new_status}`);
              
              chargesWithStatus.push({
                ...endEvent,
                startTimestamp: change.timestamp,
                isCompleted: true,
                durationMinutes,
                isOverLimit: durationMinutes > 120
              });
            }
          }
        }
      });

      // Agregar eventos SUELTOS (liberaciones sin inicio registrado)
      Object.values(changesByConnector).forEach(connectorChanges => {
        connectorChanges.forEach(change => {
          if ((change.new_status === 'FREE' || change.new_status === 'AVAILABLE')) {
            const eventKey = `${change.connector_id}-${change.timestamp}-${change.new_status}`;
            if (!processedEventIndices.has(eventKey)) {
              chargesWithStatus.push({
                ...change,
                startTimestamp: change.timestamp,
                isCompleted: false,
                durationMinutes: -1,
                isOverLimit: false
              });
              processedEventIndices.add(eventKey);
            }
          }
        });
      });
      
      // Filtrar por últimos 30 días
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const sortedCharges = chargesWithStatus
        .sort((a, b) => new Date(b.startTimestamp || b.timestamp).getTime() - new Date(a.startTimestamp || a.timestamp).getTime())
        .filter(c => {
          const is30DaysOld = new Date(c.startTimestamp || c.timestamp).getTime() >= thirtyDaysAgo.getTime();
          const isSanctionable = c.isCompleted && c.durationMinutes > 120;  // Solo cargas completas > 120 min
          return is30DaysOld && isSanctionable;
        });

      // Aplicar deduplicación visual para eliminar duplicados antiguos
      const deduplicatedCharges = deduplicateSanctionable(sortedCharges);

      setChargeHistory(deduplicatedCharges);
    }
  }, [stateChanges]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Calcular sancionables inmediatamente cuando chargeHistory cambia
  useEffect(() => {
    if (chargeHistory.length > 0) {
      setSanctionableCharges(calculateSanctionable(chargeHistory));
    } else {
      setSanctionableCharges(0);
    }
  }, [chargeHistory]);

  // Actualizar sancionables cada 30 segundos
  useEffect(() => {
    const timer = setInterval(() => {
      setSanctionableCharges(calculateSanctionable(chargeHistory));
    }, 30000);
    return () => clearInterval(timer);
  }, [chargeHistory]);

  // Actualizar reloj cada 30 segundos
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(clockInterval);
  }, []);

  // Auto-recarga de datos cada 60 segundos (sin reload de página)
  useEffect(() => {
    const reloadInterval = setInterval(() => {
      fetchData();
    }, 60000);
    return () => clearInterval(reloadInterval);
  }, []);

  // Validar sesión: auto-logout después de 120 segundos usando sessionStorage
  useEffect(() => {
    const SESSION_KEY = 'monitor_session_start';
    const SESSION_TIMEOUT = 120000;

    const storedStartTime = sessionStorage.getItem(SESSION_KEY);

    if (!storedStartTime) {
      sessionStorage.setItem(SESSION_KEY, Date.now().toString());
    } else {
      const elapsedTime = Date.now() - parseInt(storedStartTime, 10);
      if (elapsedTime > SESSION_TIMEOUT) {
        sessionStorage.removeItem(SESSION_KEY);
        window.location.href = '/';
      }
    }
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

  const getStatusColor = (status) => {
    if (status === 'FREE' || status === 'AVAILABLE') {
      return 'bg-green-900 text-green-100 border-l-4 border-green-500';
    }
    if (status === 'OCCUPIED') {
      return 'bg-red-900 text-red-100 border-l-4 border-red-500';
    }
    return 'bg-yellow-900 text-yellow-100 border-l-4 border-yellow-500';
  };

  // Función para detectar cargadores con más de 2h
  const hasOvertimeCharges = (connector: any) => {
    if (connector.status !== 'OCCUPIED') return false;
    const minutes = Math.floor((Date.now() - new Date(connector.status_changed_at).getTime()) / 60000);
    return minutes > 120;
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
      return bDuration - aDuration;
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
            
            {/* Reloj y contadores */}
            <div className="flex items-center justify-between bg-slate-800 bg-opacity-50 p-4 rounded-lg">
              <div className="text-white text-2xl font-mono">
                {currentTime.toLocaleTimeString('es-ES')}
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-orange-400 text-xs font-bold tracking-wider">SANCIONABLES HOY</div>
                  <div className="text-orange-300 text-3xl font-bold">{sanctionableCharges}</div>
                </div>
                <div className="w-px h-10 bg-slate-600" />
                <div className="text-center">
                  <div className="text-red-500 text-xs font-bold tracking-wider">SANCIONABLES AHORA</div>
                  <div className="text-red-400 text-3xl font-bold">{sanctionableIds.size}</div>
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

          {/* Mapa de estaciones */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-bold text-lg">Mapa de Estaciones</h2>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-slate-400">Libre</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-full bg-yellow-400" />
                  <span className="text-slate-400">Ocupado</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-slate-400 font-semibold">Alerta +2h</span>
                </span>
              </div>
            </div>
            <div className="rounded-lg overflow-hidden border border-slate-600">
              <StationsMap stations={stations} hasOvertimeCharges={hasOvertimeCharges} />
            </div>
          </div>

          {/* Todas las estaciones con todos sus conectores - orden fijo */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stations
              .slice()
              .sort((a, b) => (STATION_ORDER[a.id] ?? 999) - (STATION_ORDER[b.id] ?? 999))
              .map(station => (
                <div
                  key={station.id}
                  className="rounded-lg p-4 border transition bg-slate-700 border-slate-600 hover:border-slate-500"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-white font-bold text-2xl">{station.name}</h3>
                    </div>
                    {(() => {
                      const count = allOccupiedConnectors.filter(c => c.stationName === station.name && sanctionableIds.has(c.id)).length;
                      if (count === 0) return null;
                      return (
                        <div className="flex items-center gap-1 bg-red-900 border border-red-500 rounded-full px-2 py-0.5 text-red-300 font-bold text-xs">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-red-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 15a1 1 0 110-2 1 1 0 010 2zm1-4a1 1 0 01-2 0V7a1 1 0 012 0v6z"/>
                          </svg>
                          <span>{count}</span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto pr-2">
                    {(station.connectors || [])
                      .sort((a, b) => {
                        // Sancionables primero, luego ocupados, luego libres
                        const aScore = sanctionableIds.has(a.id) ? 2 : (a.status === 'OCCUPIED' ? 1 : 0);
                        const bScore = sanctionableIds.has(b.id) ? 2 : (b.status === 'OCCUPIED' ? 1 : 0);
                        return bScore - aScore;
                      })
                      .map((connector, idx) => {
                        const isSanctionable = sanctionableIds.has(connector.id);
                        
                        return (
                          <div key={idx} className="space-y-2">
                            <div
                              className={`p-3 rounded-lg border-2 flex flex-col justify-center h-20 ${getStatusColor(connector.status)} ${
                                isSanctionable 
                                  ? 'animate-pulse border-red-500 shadow-lg shadow-red-500' 
                                  : ''
                              }`}
                              style={
                                isSanctionable
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
                                  <span className="text-xl sm:text-2xl font-bold">
                                    {connector.status === 'FREE' || connector.status === 'AVAILABLE' ? 'LIBRE' :
                                     connector.status === 'OCCUPIED' ? 'OCUPADO' :
                                     'FUERA DE SERVICIO'}
                                  </span>
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

          {/* Mensaje si no hay estaciones cargadas */}
          {stations.length === 0 && (
            <div className="bg-slate-700 border-l-4 border-slate-500 text-slate-100 p-6 rounded text-center text-lg font-bold">
              Sin datos de estaciones
            </div>
          )}

          {/* Histórico de Cargas Sancionables */}
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-white mb-4">Histórico de Cargas Sancionables</h2>
            <div className="bg-slate-800 rounded-lg overflow-hidden">
              {chargeHistory.length > 0 ? (
                <div className="max-h-[80vh] overflow-y-auto">
                  {(() => {
                    // Agrupar chargeHistory por día
                    const groupedByDay: Record<string, any[]> = {};
                    chargeHistory.forEach(charge => {
                      const timestamp = new Date(charge.startTimestamp || charge.timestamp);
                      const dayKey = timestamp.toLocaleDateString('es-ES');
                      if (!groupedByDay[dayKey]) groupedByDay[dayKey] = [];
                      groupedByDay[dayKey].push(charge);
                    });

                    // Ordenar días en forma descendente (más reciente primero)
                    const sortedDays = Object.keys(groupedByDay).sort((a, b) => {
                      const dateA = new Date(a.split('/').reverse().join('-')).getTime();
                      const dateB = new Date(b.split('/').reverse().join('-')).getTime();
                      return dateB - dateA;
                    });

                    // Renderizar un bloque por día
                    return sortedDays.map(dayKey => {
                      const chargesOfDay = groupedByDay[dayKey];
                      // Ordenar cargas del día por hora ascendente
                      const sortedCharges = [...chargesOfDay].sort((a, b) =>
                        new Date(a.startTimestamp || a.timestamp).getTime() - new Date(b.startTimestamp || b.timestamp).getTime()
                      );
                      
                      // Construir fecha formateada
                      const firstCharge = sortedCharges[0];
                      const timestamp = new Date(firstCharge.startTimestamp || firstCharge.timestamp);
                      const dayFormatted = timestamp.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).toUpperCase();
                      
                      // Contar total de cargas (OCCUPIED solo) de este día desde stateChanges
                      const dayDateString = timestamp.toLocaleDateString('es-ES');
                      let totalChargesThisDay = 0;
                      stateChanges.forEach(change => {
                        const changeTime = new Date(change.timestamp);
                        const changeDateString = changeTime.toLocaleDateString('es-ES');
                        if (changeDateString === dayDateString && change.new_status === 'OCCUPIED') {
                          totalChargesThisDay++;
                        }
                      });

                      return (
                        <div key={dayKey}>
                          {/* Separador de día con contador */}
                          <div className="bg-slate-200 px-3 py-3 border-b-2 border-slate-400">
                            <div className="font-bold text-slate-900 text-sm mb-1">
                              {dayFormatted}
                            </div>
                            <div className="text-sm text-slate-800">
                              Cargas: <span className="text-blue-600 font-bold">{totalChargesThisDay}</span> | Sancionables: <span className="text-red-600 font-bold">{sortedCharges.length}</span>
                            </div>
                          </div>

                          {/* Cargas del día */}
                          {sortedCharges.map((charge, idx) => {
                            const ts = new Date(charge.startTimestamp || charge.timestamp);
                            const timeStr = ts.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                            const dateStr = ts.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
                            
                            const mins = charge.durationMinutes || 0;
                            const durationStr = mins === -1
                              ? 'Inicio no registrado'
                              : (mins >= 60 
                                  ? `${Math.floor(mins / 60)}h ${mins % 60}m` 
                                  : `${mins}m`);

                            return (
                              <div key={`${dayKey}-${idx}`} className="bg-red-900/70 px-3 py-2 flex items-start gap-2 border-b border-slate-600 last:border-b-0">
                                <span className="text-2xl mt-1">{getCarIcon(charge.connector_id, idx)}</span>
                                <div className="flex-1">
                                  <div className="font-mono text-sm text-slate-300 flex gap-3 mb-1">
                                    <span className="text-slate-400">{dateStr} {timeStr}</span>
                                    <span className="text-blue-300 font-bold">ID: {charge.connector_id}</span>
                                  </div>
                                  <div className="font-mono text-sm flex gap-3 items-center">
                                    <span className="text-slate-300">{charge.station_name}</span>
                                    <span className="text-red-400 font-bold">
                                      {durationStr}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div className="bg-slate-800 p-4 text-slate-400 text-center">
                  Sin cargas sancionables registradas
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
