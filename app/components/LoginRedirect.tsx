'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginRedirect() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Definir contraseñas válidas y sus destinos
    const naachoPasswords = ['NACHO', 'Nacho', 'nacho', '1111'];
    const policialocalPassword = 'POLICIALOCAL';

    if (naachoPasswords.includes(password)) {
      // Autenticar y redirigir a /monitor
      sessionStorage.setItem('monitor-nacho', 'true');
      router.push('/monitor');
      setPassword('');
      setError('');
    } else if (password === policialocalPassword) {
      // Autenticar y redirigir a /monitor-policialocal
      sessionStorage.setItem('monitor-policialocal', 'true');
      router.push('/monitor-policialocal');
      setPassword('');
      setError('');
    } else {
      setError('Contraseña incorrecta');
      setPassword('');
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-8">
          <h1 className="text-3xl font-bold text-white mb-2 text-center">
            NUBE MONITORING
          </h1>
          <p className="text-slate-400 text-center mb-8">
            Sistema de Monitoreo de Estaciones de Carga
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa la contraseña"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 transition"
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
            >
              Acceder
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-700">
            <p className="text-slate-400 text-xs text-center">
              Selecciona tu rol:
            </p>
            <ul className="text-slate-400 text-xs mt-4 space-y-2">
              <li>• <span className="text-blue-400">NACHO / Nacho / nacho / 1111</span>: Monitoreo Completo</li>
              <li>• <span className="text-red-400">POLICIALOCAL</span>: Vista de Sancionables</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
