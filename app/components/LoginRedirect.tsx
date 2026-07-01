'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginRedirect() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Leer el valor directamente del formulario para evitar problemas con autorellenado
    const formData = new FormData(e.currentTarget);
    const rawPassword = (formData.get('password') as string) || password;
    const p = rawPassword.trim().toUpperCase();

    if (p === 'NACHO' || p === '1111') {
      router.push('/monitor');
    } else if (p === 'OSUNA' || p === 'POLICIALOCAL') {
      router.push('/monitor-policialocal');
    } else if (p === '1967') {
      router.push('/accesos-web');
    } else {
      setError('Contraseña incorrecta');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-8">
          <h1 className="text-3xl font-bold text-white mb-6 text-center">
            Acceso Restringido
          </h1>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa la contraseña"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                autoFocus
              />
            </div>
            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
            >
              Acceder
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
