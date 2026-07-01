'use client';

import { useState } from 'react';

export default function RegistroAccesosPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    const cleanPassword = password.trim().toUpperCase();
    
    if (cleanPassword === '1111') {
      setIsAuthenticated(true);
      setPasswordError(false);
      setPassword('');
      loadLogs();
    } else {
      setPasswordError(true);
      setPassword('');
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/access-log');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('[v0] Error cargando logs:', err);
    } finally {
      setLoading(false);
    }
  };

  // Pantalla de login
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
        <div className="bg-slate-800 rounded-lg p-8 shadow-2xl max-w-md w-full">
          <h1 className="text-3xl font-bold text-white mb-6 text-center">Registro de Accesos</h1>
          
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

  // Vista de registros
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-bold text-white">Registro de Accesos</h1>
            <button
              onClick={() => {
                setIsAuthenticated(false);
                setLogs([]);
              }}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-green-900/50 border border-green-600 rounded-lg p-4">
            <div className="text-green-300 text-sm">Accesos Exitosos</div>
            <div className="text-green-400 text-3xl font-bold">
              {logs.filter(l => l.status === 'success').length}
            </div>
          </div>
          <div className="bg-red-900/50 border border-red-600 rounded-lg p-4">
            <div className="text-red-300 text-sm">Intentos Fallidos</div>
            <div className="text-red-400 text-3xl font-bold">
              {logs.filter(l => l.status === 'failed').length}
            </div>
          </div>
          <div className="bg-slate-700 border border-slate-600 rounded-lg p-4">
            <div className="text-slate-300 text-sm">Total de Intentos</div>
            <div className="text-slate-100 text-3xl font-bold">
              {logs.length}
            </div>
          </div>
        </div>

        {/* Tabla de registros */}
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-6 text-center text-slate-400">Cargando...</div>
            ) : logs.length > 0 ? (
              <table className="w-full">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">#</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Fecha y Hora</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Contraseña</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {logs.map((log, idx) => {
                    const isSuccess = log.status === 'success';
                    const statusBg = isSuccess ? 'bg-green-900/30' : 'bg-red-900/30';
                    const statusText = isSuccess ? 'text-green-400' : 'text-red-400';
                    const statusLabel = isSuccess ? 'Exitoso' : 'Fallido';

                    return (
                      <tr key={idx} className={`${statusBg} hover:bg-slate-700/50 transition`}>
                        <td className="px-6 py-3 text-sm text-slate-300">{logs.length - idx}</td>
                        <td className="px-6 py-3 text-sm text-slate-300 font-mono">{log.date}</td>
                        <td className="px-6 py-3 text-sm text-slate-200 font-mono font-bold">{log.password}</td>
                        <td className={`px-6 py-3 text-sm font-semibold ${statusText}`}>
                          {isSuccess ? '✓' : '✕'} {statusLabel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-6 text-center text-slate-400">
                No hay registros de acceso
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
