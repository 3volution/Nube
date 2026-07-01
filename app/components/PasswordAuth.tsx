'use client';

import { useState, useEffect } from 'react';

interface PasswordAuthProps {
  children: React.ReactNode;
  correctPassword: string;
}

export function PasswordAuth({ children, correctPassword }: PasswordAuthProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Verificar si ya hay sesión guardada
    const storedAuth = sessionStorage.getItem('monitor-authenticated');
    if (storedAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === correctPassword) {
      sessionStorage.setItem('monitor-authenticated', 'true');
      setIsAuthenticated(true);
      setError('');
      setPassword('');
    } else {
      setError('Contraseña incorrecta');
      setPassword('');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('monitor-authenticated');
    setIsAuthenticated(false);
    setPassword('');
    setError('');
  };

  if (!mounted) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-slate-800 rounded-lg shadow-2xl p-8 border border-slate-700">
            <h1 className="text-3xl font-bold text-white mb-2 text-center">
              Acceso Restringido
            </h1>
            <p className="text-slate-400 text-center mb-6">
              Por favor, ingresa la contraseña para continuar
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {error && (
                <div className="text-red-400 text-sm text-center bg-red-900/20 p-2 rounded border border-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                Acceder
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={handleLogout}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
        >
          Cerrar Sesión
        </button>
      </div>
      {children}
    </>
  );
}
