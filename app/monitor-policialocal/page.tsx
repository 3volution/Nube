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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

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
        fetch('/api/state-changes?limit=2000')
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
          
          if (change.new_status !== 'FREE' && change.new_status !== 'AVAILABLE') {
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
      
      // Deduplicar cargas
      const uniqueCharges = [];
      const chargeKeys = new Set<string>();
      
      chargesWithStatus.forEach(charge => {
        const chargeDate = new Date(charge.timestamp);
        const chargeKey = `${charge.connector_id}-${chargeDate.getFullYear()}-${chargeDate.getMonth()}-${chargeDate.getDate()}-${chargeDate.getHours()}`;
        
        if (!chargeKeys.has(chargeKey)) {
          chargeKeys.add(chargeKey);
          uniqueCharges.push(charge);
        }
      });
      
      // Ordenar y limitar
      const sortedCharges = uniqueCharges
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 200);
      
      setChargeHistory(sortedCharges);
    }
  }, [stateChanges]);

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

  // Contraseñas válidas
  const VALID_PASSWORDS = ['NACHO', '1111', 'OSUNA', 'POLICIALOCAL'];

  // Función para validar contraseña
  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    // Validar: trim para espacios, toUpperCase para mayúsculas
    const cleanPassword = password.trim().toUpperCase();
    
    if (VALID_PASSWORDS.includes(cleanPassword)) {
      setIsAuthenticated(true);
      setPasswordError(false);
      setPassword('');
    } else {
      setPasswordError(true);
      setPassword('');
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

  // Pantalla de login
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
        <div className="bg-slate-800 rounded-lg p-8 shadow-2xl max-w-md w-full">
          <h1 className="text-3xl font-bold text-white mb-6 text-center">Acceso Restringido</h1>
          
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingrese contraseña"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
              {passwordError && (
                <p className="text-red-400 text-sm mt-2">Contraseña incorrecta</p>
              )}
            </div>
            
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200"
            >
              Acceder
            </button>
          </form>
        </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stations.map(station => {
              // Filtrar conectores ocupados de esta estación
              const stationConnectors = allOccupiedConnectors.filter(c => c.stationName === station.name);
              
              if (stationConnectors.length === 0) return null;
              
              return (
                <div
                  key={station.id}
                  className="rounded-lg p-4 border bg-slate-700 border-slate-600 hover:border-slate-500 transition"
                >
                  <div className="mb-4">
                    <h3 className="text-white font-bold text-2xl">{station.name}</h3>
                  </div>

                  <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto pr-2">
                    {stationConnectors.map((connector, idx) => {
                      const durationMinutes = Math.floor((Date.now() - new Date(connector.status_changed_at).getTime()) / 60000);
                      const excessMinutes = durationMinutes - 120;
                      const isSanctionable = sanctionableIds.has(connector.id);
                      
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border-2 flex flex-col justify-center h-20 ${
                            isSanctionable
                              ? 'bg-red-900/70 border-red-500 animate-pulse'
                              : 'bg-yellow-900/60 border-yellow-600'
                          }`}
                        >
                          <div className="text-white">
                            <div className="font-bold text-sm">{connector.visualRef || connector.id}</div>
                            <div className="text-xs opacity-75 mt-1">{formatTime(connector.status_changed_at)}</div>
                            {isSanctionable && (
                              <div className="text-xs text-yellow-300 font-bold mt-1">+{excessMinutes} min</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mensaje si no hay conectores ocupados */}
          {allOccupiedConnectors.length === 0 && (
            <div className="bg-green-900 border-l-4 border-green-500 text-green-100 p-6 rounded text-center text-lg font-bold">
              ✅ No hay conectores ocupados en este momento
            </div>
          )}
          )}
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
                        <div className="text-lg font-bold">{isSanctionable ? '⚠�� SANCIONABLE' : '🔌 OCUPADO'}</div>
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

          {/* Histórico de Cargas Sancionables */}
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-white mb-4">Histórico de Cargas Sancionables</h2>
            <div className="bg-slate-800 rounded-lg overflow-hidden">
              {chargeHistory.filter(c => c.isOverLimit).length > 0 ? (
                <div className="max-h-96 overflow-y-auto">
                  {chargeHistory.filter(c => c.isOverLimit).map((charge, idx) => {
                    const timestamp = new Date(charge.timestamp);
                    const timeStr = timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    const dateStr = timestamp.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
                    
                    // Detectar si es el primer elemento o cambio de fecha
                    let showDaySeparator = idx === 0;
                    if (idx > 0) {
                      const filteredCharges = chargeHistory.filter(c => c.isOverLimit);
                      const prevTimestamp = new Date(filteredCharges[idx - 1].timestamp);
                      const currentDate = new Date(timestamp).toLocaleDateString('es-ES');
                      const prevDate = new Date(prevTimestamp).toLocaleDateString('es-ES');
                      showDaySeparator = currentDate !== prevDate;
                    }
                    
                    // Formato duracion: solo minutos o horas:minutos
                    const mins = charge.durationMinutes || 0;
                    const durationStr = mins >= 60 
                      ? `${Math.floor(mins / 60)}h ${mins % 60}m` 
                      : `${mins}m`;
                    
                    return (
                      <div key={idx}>
                        {/* Separador de día a las 23:59 */}
                        {showDaySeparator && idx > 0 && (
                          <div className="bg-slate-200 px-3 py-3 border-b-2 border-slate-400">
                            <div className="font-bold text-slate-900 text-sm">
                              DÍA ANTERIOR - 23:59 HORAS
                            </div>
                          </div>
                        )}
                        
                        {/* Línea de carga sancionable (roja) */}
                        <div className="bg-red-900/70 px-3 py-2 flex items-start gap-2 border-b border-slate-600 last:border-b-0">
                          <span className="text-2xl mt-1">{getCarIcon(charge.connector_id, idx)}</span>
                          <div className="flex-1">
                            {/* Primera línea: fecha, hora, ID */}
                            <div className="font-mono text-sm text-slate-300 flex gap-3 mb-1">
                              <span className="text-slate-400">{dateStr} {timeStr}</span>
                              <span className="text-blue-300 font-bold">ID: {charge.connector_id}</span>
                            </div>
                            {/* Segunda línea: ubicación y tiempo */}
                            <div className="font-mono text-sm flex gap-3 items-center">
                              <span className="text-slate-300">{charge.station_name}</span>
                              <span className="text-red-400 font-bold">
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
