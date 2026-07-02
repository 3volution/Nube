'use client';

import { useState, useEffect } from 'react';

export default function AccesosWebPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/access-log')
      .then(res => res.json())
      .then(data => setLogs(data.logs || []))
      .catch(err => console.error('[v0] Error cargando logs:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Registro de Accesos a la Web</h1>
          <p className="text-slate-300">Historial completo de intentos de acceso</p>
        </div>

        {loading ? (
          <div className="bg-slate-800 rounded-lg p-8 text-center">
            <p className="text-slate-300 text-lg">Cargando registros...</p>
          </div>
        ) : logs.length > 0 ? (
          <div className="bg-slate-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-700 border-b border-slate-600">
                    <th className="px-6 py-4 text-left text-sm font-bold text-slate-300">#</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-slate-300">Fecha y Hora</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-slate-300">Contraseña</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-slate-300">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => {
                    const isSuccess = log.status === 'success';
                    const bgRow = idx % 2 === 0 ? 'bg-slate-800' : 'bg-slate-750';
                    const statusIcon = isSuccess ? '✓' : '✕';
                    const statusColor = isSuccess ? 'text-green-400' : 'text-red-400';
                    const statusBg = isSuccess ? 'bg-green-900/30' : 'bg-red-900/30';

                    return (
                      <tr key={idx} className={`${bgRow} border-b border-slate-700 hover:bg-slate-700/50 transition`}>
                        <td className="px-6 py-4 text-sm text-slate-300">{logs.length - idx}</td>
                        <td className="px-6 py-4 text-sm text-slate-300 font-mono">{log.date}</td>
                        <td className="px-6 py-4 text-sm text-slate-200 font-mono font-bold">{log.password}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${statusBg} ${statusColor} font-bold`}>
                            <span>{statusIcon}</span>
                            <span>{isSuccess ? 'Exitoso' : 'Fallido'}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-700 px-6 py-4 border-t border-slate-600">
              <div className="flex justify-between items-center text-sm text-slate-300">
                <span>Total de registros: <span className="font-bold text-white">{logs.length}</span></span>
                <span>
                  Exitosos: <span className="font-bold text-green-400">
                    {logs.filter(l => l.status === 'success').length}
                  </span>
                  {' | '}
                  Fallidos: <span className="font-bold text-red-400">
                    {logs.filter(l => l.status === 'failed').length}
                  </span>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-lg p-8 text-center">
            <p className="text-slate-400 text-lg">Sin registros de acceso</p>
          </div>
        )}
      </div>
    </div>
  );
}
