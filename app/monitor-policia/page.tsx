'use client';

import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/app/config/version';
import { CallEventModal } from '@/app/components/CallEventModal';
import { PasswordAuth } from '@/app/components/PasswordAuth';

function MonitorPoliciaContent() {
  const [stations, setStations] = useState([]);
  const [stateChanges, setStateChanges] = useState([]);
  const [logs, setLogs] = useState([]);
  const [chargeHistory, setChargeHistory] = useState([]);
  const [dailyChargesPerStation, setDailyChargesPerStation] = useState({});
  const [sanctionablePerStation, setSanctionablePerStation] = useState({});
  const [totalDailyCharges, setTotalDailyCharges] = useState(0);
  const [occupancyPerStation, setOccupancyPerStation] = useState({});
  const [globalOccupancy, setGlobalOccupancy] = useState(0);
  const [sanctionableCharges, setSanctionableCharges] = useState(0);
  const [todayCharges, setTodayCharges] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const cachedDate = localStorage.getItem('cachedDate_policia');
        const today = new Date().toDateString();
        if (cachedDate === today) {
          const cached = localStorage.getItem('todayCharges_policia');
          return cached ? parseInt(cached) : 0;
        } else {
          localStorage.setItem('cachedDate_policia', today);
          return 0;
        }
      }
    } catch { /* Safari privado bloquea localStorage */ }
    return 0;
  });
  const [todayOccupancy, setTodayOccupancy] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const cachedDate = localStorage.getItem('cachedDate_policia');
        const today = new Date().toDateString();
        if (cachedDate === today) {
          const cached = localStorage.getItem('todayOccupancy_policia');
          return cached ? parseInt(cached) : 0;
        }
      }
    } catch { /* Safari privado bloquea localStorage */ }
    return 0;
  });
  const [todaySanctionable, setTodaySanctionable] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const cachedDate = localStorage.getItem('cachedDate_policia');
        const today = new Date().toDateString();
        if (cachedDate === today) {
          const cached = localStorage.getItem('todaySanctionable_policia');
          return cached ? parseInt(cached) : 0;
        }
      }
    } catch { /* Safari privado bloquea localStorage */ }
    return 0;
  });
  const [currentlyOccupied, setCurrentlyOccupied] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const STATION_ORDER = {
    828537: 0,
    828524: 1,
    828534: 2,
    828535: 3,
    828523: 4,
    828538: 5
  };

  const fetchData = async () => {
    try {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 30);
      const sinceParam = sinceDate.toISOString().split('T')[0];

      const [stationsRes, changesRes, logsRes] = await Promise.all([
        fetch('/api/stations'),
        fetch(`/api/state-changes?limit=500&since=${sinceParam}`),
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

  // Extraer historial de cargas con estado
  useEffect(() => {
    if (stateChanges.length > 0) {
      const sortedByTime = [...stateChanges].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const changesByConnector: Record<string, typeof stateChanges> = {};
      sortedByTime.forEach(change => {
        const key = change.connector_id;
        if (!changesByConnector[key]) changesByConnector[key] = [];
        changesByConnector[key].push(change);
      });

      const chargesWithStatus: Array<typeof stateChanges[0] & { isCompleted: boolean; durationMinutes: number; isOverLimit: boolean; startTimestamp: string }> = [];
      const processedEventIndices = new Set<string>();

      Object.values(changesByConnector).forEach(connectorChanges => {
        for (let i = 0; i < connectorChanges.length; i++) {
          const change = connectorChanges[i];
          const eventKey = `${change.connector_id}-${change.timestamp}-${change.new_status}`;
          if (processedEventIndices.has(eventKey)) continue;

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

      Object.values(changesByConnector).forEach(connectorChanges => {
        connectorChanges.forEach(change => {
          if (change.new_status === 'FREE' || change.new_status === 'AVAILABLE') {
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

      const uniqueCharges = [];
      const chargeKeys = new Set<string>();

      chargesWithStatus.forEach(charge => {
        const chargeDate = new Date(charge.startTimestamp);
        const chargeKey = `${charge.connector_id}-${chargeDate.getFullYear()}-${chargeDate.getMonth()}-${chargeDate.getDate()}-${chargeDate.getHours()}`;
        if (!chargeKeys.has(chargeKey)) {
          chargeKeys.add(chargeKey);
          uniqueCharges.push(charge);
        }
      });

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sortedCharges = uniqueCharges
        .sort((a, b) => new Date(b.startTimestamp || b.timestamp).getTime() - new Date(a.startTimestamp || a.timestamp).getTime())
        .filter(c => {
          const is30DaysOld = new Date(c.startTimestamp || c.timestamp).getTime() >= thirtyDaysAgo.getTime();
          const isVisible = !c.isCompleted || c.durationMinutes >= 5;
          return is30DaysOld && isVisible;
        });

      setChargeHistory(sortedCharges);

      const nowUTC = new Date();
      const todayDateString = nowUTC.getUTCFullYear() + '-' +
        String(nowUTC.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(nowUTC.getUTCDate()).padStart(2, '0');

      let todayChargesCount = 0;
      let todaySanctionableCount = 0;
      let totalTodayMinutes = 0;

      sortedCharges.forEach(charge => {
        const chargeTime = new Date(charge.timestamp);
        const chargeDateString = chargeTime.getUTCFullYear() + '-' +
          String(chargeTime.getUTCMonth() + 1).padStart(2, '0') + '-' +
          String(chargeTime.getUTCDate()).padStart(2, '0');

        if (chargeDateString === todayDateString) {
          todayChargesCount++;
          if (charge.durationMinutes > 0) totalTodayMinutes += charge.durationMinutes;
          if (charge.isOverLimit) todaySanctionableCount++;
        }
      });

      const occupancyPercent = Math.min(100, Math.round((totalTodayMinutes / 11520) * 100));
      setTodayCharges(todayChargesCount);
      setTodaySanctionable(todaySanctionableCount);
      setTodayOccupancy(occupancyPercent);

      try {
        if (typeof window !== 'undefined') {
          const todayStr = new Date().toDateString();
          localStorage.setItem('cachedDate_policia', todayStr);
          localStorage.setItem('todayCharges_policia', todayChargesCount.toString());
          localStorage.setItem('todaySanctionable_policia', todaySanctionableCount.toString());
          localStorage.setItem('todayOccupancy_policia', occupancyPercent.toString());
        }
      } catch { /* Safari privado bloquea localStorage */ }

      setOccupancyPerStation({});
    }
  }, [stateChanges]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Actualizar sancionables y ocupación cada 30 segundos
  useEffect(() => {
    const timer = setInterval(() => {
      let sanctionable = 0;
      let occupied = 0;

      stations.forEach(station => {
        station.connectors?.forEach(connector => {
          if (connector.status !== 'FREE' && connector.status !== 'AVAILABLE') {
            occupied++;
            const startTime = new Date(connector.status_changed_at).getTime();
            const durationMinutes = Math.floor((Date.now() - startTime) / 60000);
            if (durationMinutes > 120) sanctionable++;
          }
        });
      });

      const totalConnectors = 12;
      const occupancyPercent = Math.round((occupied / totalConnectors) * 100);

      setSanctionableCharges(sanctionable);
      setCurrentlyOccupied(occupied);
      setGlobalOccupancy(occupancyPercent);
    }, 30000);
    return () => clearInterval(timer);
  }, [stations]);

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
    if (status === 'FREE' || status === 'AVAILABLE') return 'bg-green-900 text-green-100 border-l-4 border-green-500';
    if (status === 'OCCUPIED') return 'bg-red-900 text-red-100 border-l-4 border-red-500';
    return 'bg-yellow-900 text-yellow-100 border-l-4 border-yellow-500';
  };

  const hasOvertimeCharges = (connector) => {
    if (connector.status === 'FREE' || connector.status === 'AVAILABLE') return false;
    const startTime = new Date(connector.status_changed_at).getTime();
    const durationMinutes = Math.floor((Date.now() - startTime) / 60000);
    return durationMinutes > 120;
  };

  const getCarIcon = (connectorId: string, index?: number) => {
    const icons = ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑'];
    if (index !== undefined) return icons[index % icons.length];
    const hash = connectorId.charCodeAt(connectorId.length - 1) || 0;
    return icons[hash % icons.length];
  };

  // Agrupar estaciones de Calle Almendralejo
  const displayStations = stations.reduce((acc, station) => {
    if (station.id === 828534) {
      const almendralejo1 = station;
      const almendralejoCombined = [];
      const almendralejoCodes = ['003649', '003650', '003651', '003652'];

      stations.forEach(s => {
        s.connectors?.forEach(connector => {
          const visualRef = connector.visualRef || String(connector.id);
          if (almendralejoCodes.includes(visualRef)) almendralejoCombined.push(connector);
        });
      });

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
      <CallEventModal />
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            HackerCharger Mérida <span className="text-lg text-slate-400">{APP_VERSION}</span>
          </h1>
          <p className="text-slate-300">Sistema de monitoreo de cargadores eléctricos de vehículos en tiempo real</p>

          <div className="mt-4 space-y-3">
            {/* HOY */}
            <div className="flex items-center gap-6 text-lg flex-wrap bg-slate-800 bg-opacity-50 p-3 rounded">
              <span className="font-bold text-yellow-400">HOY:</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔌🚗</span>
                <span className="text-green-400 font-bold">{todayCharges} cargas</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <span className="text-blue-400 font-bold">{todayOccupancy}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <span className="text-red-500 font-bold">Sancionables: {todaySanctionable}</span>
              </div>
            </div>

            {/* AHORA */}
            <div className="flex items-center gap-6 text-lg flex-wrap bg-slate-800 bg-opacity-50 p-3 rounded">
              <span className="font-bold text-cyan-400">AHORA:</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <span className="text-green-400 font-bold">{currentlyOccupied} cargando</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">📊</span>
                <span className="text-blue-400 font-bold">{globalOccupancy}% (<span className="text-green-400">{currentlyOccupied}</span>/12)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <span className="text-red-500 font-bold animate-pulse">{sanctionableCharges} excedido</span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded-lg mb-6">
            Error conectando: {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        ) : (
          <>
            {/* Stations Grid - sin botón Vigilar */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <p className="text-slate-400 text-sm font-mono">
                  {currentTime.toLocaleTimeString('es-ES')}
                </p>
                <p className="text-slate-400 text-sm">
                  Última actualización: {displayStations.length > 0 ? displayStations[0].lastCheck : new Date().toLocaleString('es-ES')}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayStations.map(station => (
                  <div
                    key={station.id}
                    className="rounded-lg p-4 border bg-slate-700 border-slate-600 hover:border-slate-500 transition"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-white font-bold text-2xl">{station.name}</h3>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-red-500 font-bold text-sm">
                          <span>⚠️</span>
                          <span>{sanctionablePerStation[station.name] || 0}</span>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-400 font-bold">
                          <span className="text-lg">🔌🚗</span>
                          <span>{dailyChargesPerStation[station.name] || 0}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto pr-2">
                      {station.connectors.map((connector, idx) => (
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
                      ))}
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

            {/* Histórico de Cargas */}
            <div className="mt-8">
              <h2 className="text-2xl font-bold text-white mb-4">Historico de Cargas</h2>
              <div className="border border-slate-600 rounded-lg overflow-hidden">
                <div className="max-h-[80vh] overflow-y-auto">
                  {chargeHistory.length > 0 ? (
                    <div>
                      {chargeHistory.map((charge, idx) => {
                        const timestamp = new Date(charge.startTimestamp || charge.timestamp);
                        const timeStr = timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                        const dateStr = timestamp.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });

                        let showDaySeparator = idx === 0;
                        if (idx > 0) {
                          const prevTimestamp = new Date(chargeHistory[idx - 1].startTimestamp || chargeHistory[idx - 1].timestamp);
                          showDaySeparator = timestamp.toLocaleDateString('es-ES') !== prevTimestamp.toLocaleDateString('es-ES');
                        }

                        const dayStr = timestamp.toLocaleDateString('es-ES');
                        const dayCharges = chargeHistory.filter(c =>
                          new Date(c.startTimestamp || c.timestamp).toLocaleDateString('es-ES') === dayStr
                        );
                        const dayCompleted = dayCharges.filter(c => c.isCompleted).length;
                        const dayOverLimit = dayCharges.filter(c => c.isOverLimit).length;

                        const mins = charge.durationMinutes || 0;
                        const durationStr = mins === -1
                          ? 'Inicio no registrado'
                          : (mins >= 60
                              ? `${Math.floor(mins / 60)}h ${mins % 60}m`
                              : `${mins}m`);

                        let bgColor = 'bg-slate-700';
                        if (charge.isCompleted) {
                          bgColor = charge.isOverLimit ? 'bg-red-900/70' : 'bg-green-900/50';
                        }

                        return (
                          <div key={idx}>
                            {showDaySeparator && (
                              <div className="bg-slate-200 px-3 py-3 flex items-center justify-between border-b-2 border-slate-400">
                                <div className="flex-1">
                                  <div className="font-bold text-slate-900 text-sm mb-2">
                                    {timestamp.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).toUpperCase()}
                                  </div>
                                  <div className="flex gap-8 text-sm text-slate-800">
                                    <div className="flex gap-2">
                                      <span className="font-semibold">Cargas:</span>
                                      <span className="text-green-600 font-bold">{dayCompleted}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="font-semibold">Sancionables:</span>
                                      <span className="text-red-600 font-bold">{dayOverLimit}</span>
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
                                  <span className="text-slate-300">{charge.station_name}</span>
                                  <span className={charge.isOverLimit ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>
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

export default function MonitorPoliciaPage() {
  return (
    <PasswordAuth
      correctPasswords={[process.env.NEXT_PUBLIC_POLICIA_PASSWORD || 'policia2024']}
      sessionKey="monitor-policia-authenticated"
    >
      <MonitorPoliciaContent />
    </PasswordAuth>
  );
}
