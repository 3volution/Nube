'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginRedirect() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Leer directamente del DOM, nunca del estado de React
    const raw = inputRef.current?.value ?? '';
    const p = raw.trim().toUpperCase();

    const isMonitor = p === 'NACHO' || p === '1111';
    const isPolicia = p === 'OSUNA' || p === 'POLICIA';
    const isAccesos = p === '1967';
    const isValid = isMonitor || isPolicia || isAccesos;

    // Registrar intento en segundo plano, sin bloquear navegación
    fetch('/api/access-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: p, status: isValid ? 'success' : 'failed' })
    }).catch(() => {});

    if (isMonitor) {
      router.push('/monitor');
    } else if (isPolicia) {
      router.push('/monitor-policialocal');
    } else if (isAccesos) {
      router.push('/accesos-web');
    } else {
      setError('Contraseña incorrecta');
      if (inputRef.current) inputRef.current.value = '';
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
                ref={inputRef}
                id="password"
                name="password"
                type="password"
                placeholder="Ingresa la contraseña"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                autoFocus
                autoComplete="off"
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
