'use client';

import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/app/config/version';

export default function MonitorPage() {
  const [stations, setStations] = useState([]);
  const [stateChanges, setStateChanges] = useState([]);
  const [logs, setLogs] = useState([]);
  const [chargeHistory, setChargeHistory] = useState([]); // Historial de cargas completadas
  const [dailyChargesPerStation, setDailyChargesPerStation] = useState({}); // Cargas por estación hoy
  const [sanctionablePerStation, setSanctionablePerStation] = useState({}); // Sancionables por estación hoy
  const [totalDailyCharges, setTotalDailyCharges] = useState(0); // Total cargas hoy
  const [occupancyPerStation, setOccupancyPerStation] = useState({}); // Porcentaje ocupación por estación
  const [globalOccupancy, setGlobalOccupancy] = useState(0); // Porcentaje ocupación global
  const [sanctionableCharges, setSanctionableCharges] = useState(0); // Cargas > 2 horas EN TIEMPO REAL
  const [todayCharges, setTodayCharges] = useState(() => {
    // Intentar cargar valor anterior de localStorage
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('todayCharges');
      return cached ? parseInt(cached) : 0;
    }
    return 0;
  }); // Total cargas HOY desde 00:00
  const [todayOccupancy, setTodayOccupancy] = useState(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('todayOccupancy');
      return cached ? parseInt(cached) : 0;
    }
    return 0;
  }); // Ocupación promedio HOY
  const [todaySanctionable, setTodaySanctionable] = useState(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('todaySanctionable');
      return cached ? parseInt(cached) : 0;
    }
    return 0;
  }); // Total sancionables HOY
  const [currentlyOccupied, setCurrentlyOccupied] = useState(0); // Conectores OCUPADOS en este momento
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('estaciones');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Mapeo de station_id a nombre de estacion (para hacer match robusto)
  const STATION_ID_TO_NAME = {
    '828537': 'Estacion Bus',
    '828524': 'Avda. Roma',
    '828534': 'Calle Almendralejo',
    '828535': 'Calle Almendralejo',
    '828523': 'Plaza Xirgu',
    '828538': 'Avda. del Prado'
  };

  // Función para obtener datos
  const fetchData = async () => {
    try {
      const [stateChangesRes, stationsRes, chargesRes] = await Promise.all([
        fetch('/api/state-changes?limit=200'),
        fetch('/api/stations'),
        fetch('/api/logs?limit=100')
      ]);

      const stateChangesData = await stateChangesRes.json();
      const stationsData = await stationsRes.json();
      const chargesData = await chargesRes.json();

      setStateChanges(stateChangesData || []);
      setStations(stationsData || []);
      setLoading(false);
    } catch (err) {
      console.error('[v0] Error fetching data:', err);
      setError('Error al cargar datos');
      setLoading(false);
    }
  };

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
      
      // Crear historial solo con cambios OCUPADO→FREE completados
      const chargesWithStatus: Array<typeof stateChanges[0] & { isCompleted: boolean; durationMinutes: number; isOverLimit: boolean; startTimestamp: string }> = [];
      const processedEventIndices = new Set<string>(); // Para evitar procesar el mismo evento dos veces
      
      Object.values(changesByConnector).forEach(connectorChanges => {
        // Recorrer los eventos en orden cronologico
        for (let i = 0; i < connectorChanges.length; i++) {
          const change = connectorChanges[i];
          
          // Si ya procesamos este evento, saltar
          const eventKey = `${change.connector_id}-${change.timestamp}-${change.new_status}`;
          if (processedEventIndices.has(eventKey)) continue;
          
          // Si es OCUPADO, es inicio de carga
          if (change.new_status !== 'FREE' && change.new_status !== 'AVAILABLE') {
            const startTime = new Date(change.timestamp).getTime();
            let endEvent = null;
            let endEventIndex = -1;
            
            // Buscar si hay un FREE posterior
            for (let j = i + 1; j < connectorChanges.length; j++) {
              if (connectorChanges[j].new_status === 'FREE' || connectorChanges[j].new_status === 'AVAILABLE') {
                endEvent = connectorChanges[j];
                endEventIndex = j;
                break;
              }
            }
            
            if (endEvent) {
              // Carga completada - crear UNA sola línea usando el evento FREE
              const endTime = new Date(endEvent.timestamp).getTime();
              const durationMinutes = Math.floor((endTime - startTime) / 60000);
              
              // Marcar ambos eventos como procesados para no reutilizarlos
              processedEventIndices.add(eventKey);
              processedEventIndices.add(`${change.connector_id}-${endEvent.timestamp}-${endEvent.new_status}`);
              
              // Usar el evento FREE como base pero guardar el timestamp de inicio
              chargesWithStatus.push({
                ...endEvent, // Usar endEvent para que el timestamp sea del FREE
                startTimestamp: change.timestamp, // Guardar timestamp del OCCUPIED para cálculo de duración
                isCompleted: true,
                durationMinutes,
                isOverLimit: durationMinutes > 120
              });
            }
          }
        }
      });
      
      // Deduplicar cargas que tengan el mismo conector, fecha y hora pero distinta duración
      // (mantener solo la primera de cada grupo)
      const uniqueCharges = [];
      const chargeKeys = new Set<string>();
      
      chargesWithStatus.forEach(charge => {
        // Crear clave con conector ID, fecha y hora (sin minutos de duración)
        const chargeDate = new Date(charge.timestamp);
        const chargeKey = `${charge.connector_id}-${chargeDate.getFullYear()}-${chargeDate.getMonth()}-${chargeDate.getDate()}-${chargeDate.getHours()}`;
        
        // Si aún no hemos visto esta carga, agregarla
        if (!chargeKeys.has(chargeKey)) {
          chargeKeys.add(chargeKey);
          uniqueCharges.push(charge);
        }
      });
      
      // Ordenar por fecha descendente, filtrar solo completadas y limitar a 200
      const sortedCharges = uniqueCharges
        .filter(charge => charge.isCompleted) // Solo mostrar cargas completadas
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 200); // Aumentado de 50 a 200
      
      setChargeHistory(sortedCharges);
      
      // Calcular cargas del dia actual (desde las 00:00)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const chargesPerStation = {};
      
      // Nota: El cálculo de cargas HOY y sancionables por estación se hace en el segundo useEffect
      // que depende de chargeHistory para asegurar que los datos están listos
      
      // Calcular ocupancia por estación desde las 00:00
      const occupancyByStation = {};
      setOccupancyPerStation(occupancyByStation);
    }
  }, [stateChanges]);

  // Recalcular estadísticas HOY cuando cambie chargeHistory
  useEffect(() => {
    if (chargeHistory.length === 0) {
      setTodayOccupancy(0);
      setTodaySanctionable(0);
      return;
    }
    
    // Definir rangos de hoy: desde 00:00 hasta 23:59:59
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    let totalOccupiedTime = 0;
    let todaySanctionableCount = 0;
    let chargesCountedToday = 0;
    const sanctionableByStation = {};
    const chargesByStation = {};
    
    chargeHistory.forEach(charge => {
      const chargeTime = new Date(charge.timestamp);
      // Solo contar si la carga es HOY (>= hoy 00:00 y < mañana 00:00)
      if (chargeTime >= today && chargeTime < tomorrow) {
        chargesCountedToday++;
        
        // Contar cargas por estación
        const stationName = STATION_ID_TO_NAME[charge.station_id] || charge.station_name;
        chargesByStation[stationName] = (chargesByStation[stationName] || 0) + 1;
        
        // Sumar duración solo si es una carga completada
        if (charge.durationMinutes && charge.durationMinutes > 0) {
          totalOccupiedTime += charge.durationMinutes;
        }
        
        // Contar como sancionable si excedió 2 horas
        if (charge.isOverLimit) {
          todaySanctionableCount++;
          sanctionableByStation[stationName] = (sanctionableByStation[stationName] || 0) + 1;
        }
      }
    });
    
    const MAX_DAILY_MINUTES = 17280;
    
    // Calcular porcentaje: máximo 17280 minutos al día
    const occupancyPercent = Math.min(100, Math.round((totalOccupiedTime / MAX_DAILY_MINUTES) * 100));
    
    setTodayOccupancy(occupancyPercent);
    setTodaySanctionable(todaySanctionableCount);
    setTodayCharges(chargesCountedToday);
    setDailyChargesPerStation(chargesByStation);
    setSanctionablePerStation(sanctionableByStation);
    
    // Guardar en localStorage para persistencia entre recargas
    if (typeof window !== 'undefined') {
      localStorage.setItem('todayOccupancy', occupancyPercent.toString());
      localStorage.setItem('todaySanctionable', todaySanctionableCount.toString());
      localStorage.setItem('todayCharges', chargesCountedToday.toString());
    }
  }, [chargeHistory]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Re-renderizar cada segundo para actualizar los tiempos dinámicamente (como en Scriptable)
  useEffect(() => {
    const timer = setInterval(() => {
      // Calcular estadísticas AHORA MISMO
      let sanctionable = 0;
      let occupied = 0;
      
      stations.forEach(station => {
        station.connectors?.forEach(connector => {
          // Contar conectores ocupados en este momento
          if (connector.status !== 'FREE' && connector.status !== 'AVAILABLE') {
            occupied++;
            
            // Verificar si supera 2 horas
            const startTime = new Date(connector.status_changed_at).getTime();
            const durationMinutes = Math.floor((Date.now() - startTime) / 60000);
            if (durationMinutes > 120) {
              sanctionable++;
            }
          }
        });
      });
      
      // Calcular porcentaje de ocupación ahora mismo
      const totalConnectors = 12;
      const occupancyPercent = Math.round((occupied / totalConnectors) * 100);
      
      setSanctionableCharges(sanctionable);
      setCurrentlyOccupied(occupied);
      setGlobalOccupancy(occupancyPercent);
      
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
  const getCarIcon = (connectorId: string, index?: number) => {
    const icons = ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑'];
    // Si se proporciona índice (para líneas contiguas), usar índice
    if (index !== undefined) {
      return icons[index % icons.length];
    }
    // Si no, usar el hash del conector ID
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
      
      // Conectores que pertenecen a Calle Almendralejo - SOLO estos 4 IDs
      const almendralejoCombined = [];
      const almendralejoCodes = ['003649', '003650', '003651', '003652'];
      
      // Buscar solo los conectores con estos IDs específicos en todas las estaciones
      stations.forEach(station => {
        station.connectors?.forEach(connector => {
          const visualRef = connector.visualRef || String(connector.id);
          if (almendralejoCodes.includes(visualRef)) {
            almendralejoCombined.push(connector);
          }
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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">HackerCharger Mérida <span className="text-lg text-slate-400">{APP_VERSION}</span></h1>
          <p className="text-slate-300">Sistema de monitoreo de cargadores eléctricos de vehículos en tiempo real</p>
          
          {/* Daily Charge Counter - Two lines: HOY vs AHORA MISMO - Only show if we have charge data */}
          {chargeHistory.length > 0 ? (
          <div className="mt-4 space-y-3">
            {/* Línea 1: HOY */}
            <div className="flex items-center gap-6 text-lg flex-wrap bg-slate-800 bg-opacity-50 p-3 rounded">
              <span className="font-bold text-yellow-400">HOY:</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔌🚗</span>
                <span className="text-green-400 font-bold">{todayCharges} cargas</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">📊</span>
                <span className="text-blue-400 font-bold">{todayOccupancy}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <span className="text-red-500 font-bold">Sancionables: {todaySanctionable}</span>
              </div>
            </div>
            
            {/* Línea 2: AHORA */}
            <div className="flex items-center gap-6 text-lg flex-wrap bg-slate-800 bg-opacity-50 p-3 rounded">
              <span className="font-bold text-cyan-400">AHORA:</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <span className="text-green-400 font-bold">{currentlyOccupied} cargando</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">📊</span>
                <span className="text-blue-400 font-bold">{globalOccupancy}% ({currentlyOccupied}/12)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <span className="text-red-500 font-bold animate-pulse">{sanctionableCharges}</span>
              </div>
            </div>
          </div>
          ) : null}
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

