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
    
    const cleanPassword = password.trim();
    const upperPassword = cleanPassword.toUpperCase();
    
    // Contraseñas para /monitor: "NACHO", "1111"
    const monitorPasswords = ['NACHO', '1111'];
    
    // Contraseñas para /monitor-policialocal: "OSUNA", "POLICIALOCAL"
    const policialocalPasswords = ['OSUNA', 'POLICIALOCAL'];
    
    // Contraseña para /accesos-web
    const accesoWebPassword = '1967';

    // Registrar intento en segundo plano (no bloquea la navegación)
    const isValid = monitorPasswords.includes(upperPassword) || policialocalPasswords.includes(upperPassword) || cleanPassword === accesoWebPassword;
    fetch('/api/access-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: cleanPassword, status: isValid ? 'success' : 'failed' })
    }).catch(() => {});

    if (monitorPasswords.includes(upperPassword)) {
      sessionStorage.setItem('monitor-auth', 'true');
      router.push('/monitor');
      setPassword('');
      setError('');
    } else if (policialocalPasswords.includes(upperPassword)) {
      sessionStorage.setItem('policialocal-auth', 'true');
      router.push('/monitor-policialocal');
      setPassword('');
      setError('');
    } else if (cleanPassword === accesoWebPassword) {
      sessionStorage.setItem('accesos-web-auth', 'true');
      router.push('/accesos-web');
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
            Acceso Restringido
          </h1>

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


        </div>
      </div>
    </div>
  );
}
