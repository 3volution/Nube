'use client';

import { useEffect, useState } from 'react';

export default function MonitorPage() {
  const [stations, setStations] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      const [stationsRes, logsRes] = await Promise.all([
        fetch('/api/stations'),
        fetch(`/api/logs?limit=100`)
      ]);

      if (stationsRes.ok) {
        const stationsData = await stationsRes.json();
        setStations(stationsData.stations || []);
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
    if (!autoRefresh) return;

    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const filteredLogs = logs.filter(log => {
    if (selectedFilter === 'all') return true;
    return log.level === selectedFilter;
  });

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

  const getLevelColor = (level) => {
    switch (level) {
      case 'ERROR':
        return 'bg-red-50 border-l-4 border-red-500';
      case 'CAMBIO':
        return 'bg-blue-50 border-l-4 border-blue-500';
      case 'SUCCESS':
        return 'bg-green-50 border-l-4 border-green-500';
      default:
        return 'bg-gray-50 border-l-4 border-gray-500';
    }
  };

  const getLevelIcon = (level) => {
    switch (level) {
      case 'ERROR': return '❌';
      case 'CAMBIO': return '🔄';
      case 'SUCCESS': return '✅';
      default: return 'ℹ️';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Guardian 24/7</h1>
          <p className="text-slate-300">Sistema de Monitoreo de Cargadores Eléctricos en Tiempo Real</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded-lg mb-6">
            Error conectando: {error}
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            Actualizar Ahora
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-lg transition ${
              autoRefresh
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-slate-600 hover:bg-slate-700'
            } text-white`}
          >
            {autoRefresh ? 'Auto-actualizar: ON' : 'Auto-actualizar: OFF'}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        ) : (
          <>
            {/* Stations Grid */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-4">Estado de Estaciones</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stations.map(station => (
                  <div
                    key={station.id}
                    className="bg-slate-700 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-white font-bold text-lg">{station.name}</h3>
                        <p className="text-slate-400 text-sm">ID: {station.id}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-green-400 font-bold text-xl">{station.conectoresLibres}</p>
                        <p className="text-slate-400 text-xs">Libres</p>
                      </div>
                    </div>

                    <div className="mb-3 pb-3 border-b border-slate-600">
                      <p className="text-slate-300 text-sm">
                        <span className="text-red-400 font-bold">{station.conectoresOcupados}</span> ocupados •{' '}
                        <span className="text-slate-400">Total: {station.connectors.length}</span>
                      </p>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {station.connectors.map((connector, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded border ${getStatusColor(connector.status)}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold">{connector.visualRef || `Conector ${connector.id}`}</span>
                            <span className={`px-2 py-1 rounded text-xs font-bold ${getStatusBadge(connector.status)}`}>
                              {connector.status_display}
                            </span>
                          </div>
                          <div className="text-xs opacity-90">
                            {connector.time_in_state}
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-slate-500 text-xs mt-3 pt-3 border-t border-slate-600">
                      {station.lastCheck}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Logs Section */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">Logs del Sistema</h2>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'ERROR', 'CAMBIO', 'SUCCESS', 'INFO'].map(filter => (
                    <button
                      key={filter}
                      onClick={() => setSelectedFilter(filter)}
                      className={`px-3 py-1 rounded text-sm transition ${
                        selectedFilter === filter
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                      }`}
                    >
                      {filter === 'all' ? 'Todos' : filter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-700 rounded-lg overflow-hidden border border-slate-600">
                {filteredLogs.length === 0 ? (
                  <div className="p-6 text-center text-slate-400">
                    No hay logs para mostrar
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-800 border-b border-slate-600 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-slate-300 font-semibold">Hora</th>
                          <th className="px-4 py-3 text-left text-slate-300 font-semibold">Nivel</th>
                          <th className="px-4 py-3 text-left text-slate-300 font-semibold">Estación</th>
                          <th className="px-4 py-3 text-left text-slate-300 font-semibold">Mensaje</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLogs.map((log, idx) => (
                          <tr key={idx} className={`border-b border-slate-600 ${getLevelColor(log.level)}`}>
                            <td className="px-4 py-2 font-mono text-xs text-gray-600">{log.timestamp}</td>
                            <td className="px-4 py-2 font-bold text-gray-700">
                              <span className="mr-2">{getLevelIcon(log.level)}</span>
                              {log.level}
                            </td>
                            <td className="px-4 py-2 text-gray-700">{log.station || '-'}</td>
                            <td className="px-4 py-2 text-gray-700 max-w-md truncate">{log.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
                  <p className="text-blue-400 font-bold text-lg">{stations.length}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Total de Conectores</p>
                  <p className="text-purple-400 font-bold text-lg">
                    {stations.reduce((sum, s) => sum + s.connectors.length, 0)}
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
