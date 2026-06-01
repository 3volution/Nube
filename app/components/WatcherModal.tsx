'use client';

import { useState } from 'react';

interface Station {
  id: string | number;
  name: string;
}

interface WatcherPayload {
  station_id: string | number;
  already_active?: boolean;
  [key: string]: unknown;
}

interface WatcherModalProps {
  station: Station;
  isOpen: boolean;
  isWatching: boolean;
  onClose: () => void;
  onStart: (watcher: WatcherPayload) => void;
  onCancel: (watcher: WatcherPayload) => void;
}

export function WatcherModal({ station, isOpen, onClose, onStart, onCancel, isWatching }: WatcherModalProps) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleAuthenticate = () => {
    if (pin.toUpperCase() !== 'NACHO') {
      setError('Código incorrecto');
      setPin('');
      return;
    }
    setError(null);
    setIsAuthenticated(true);
  };

  const handleStartWatcher = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/watcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: station.id,
          station_name: station.name
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          // Ya existe vigilancia activa — tratar como éxito
          onStart({ station_id: station.id, already_active: true });
          handleClose();
          return;
        }
        setError(data.error || 'Error al activar vigilancia');
        setLoading(false);
        return;
      }

      onStart({ station_id: station.id, ...data.watcher });
      handleClose();
    } catch {
      setError('Error al conectar con el servidor');
      setLoading(false);
    }
  };

  const handleCancelWatcher = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/watcher?station_id=${station.id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Error al cancelar vigilancia');
        setLoading(false);
        return;
      }

      onCancel({ station_id: station.id });
      handleClose();
    } catch {
      setError('Error al conectar con el servidor');
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPin('');
    setIsAuthenticated(false);
    setError(null);
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-lg max-w-md w-full mx-4 border border-slate-700">
        <h2 className="text-white text-xl font-bold mb-1">
          {isWatching ? 'Vigilancia activa' : 'Vigilar estación'}
        </h2>
        <p className="text-slate-400 text-sm mb-6">{station.name}</p>

        {!isAuthenticated ? (
          <>
            <p className="text-slate-300 text-sm mb-6">
              Ingresa el código de activación para continuar.
            </p>

            <div className="mb-4">
              <label className="block text-slate-300 text-sm font-semibold mb-2">
                Código de activación
              </label>
              <div className="flex gap-2 justify-center mb-3">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div
                    key={index}
                    className="w-10 h-10 bg-slate-700 border border-slate-600 rounded flex items-center justify-center"
                  >
                    {pin.length > index && (
                      <span className="text-white text-xl">●</span>
                    )}
                  </div>
                ))}
              </div>
              <input
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value.slice(0, 5))}
                maxLength={5}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 outline-none text-center tracking-wider"
                autoFocus
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 text-red-200 rounded text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleAuthenticate}
                disabled={pin.length !== 5}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50 font-semibold"
              >
                Continuar
              </button>
            </div>
          </>
        ) : isWatching ? (
          <>
            <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-600 rounded">
              <p className="text-yellow-200 text-sm">
                Esta estación tiene vigilancia activa. Recibirás una llamada cuando un cargador quede libre.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 text-red-200 rounded text-sm">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleCancelWatcher}
                disabled={loading}
                className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded transition disabled:opacity-50 font-semibold"
              >
                {loading ? 'Cancelando...' : 'Cancelar vigilancia'}
              </button>
              <button
                onClick={handleClose}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition"
              >
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-slate-300 text-sm mb-6">
              Recibirás una llamada cuando un cargador pase de ocupado a libre en esta estación.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 text-red-200 rounded text-sm">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleStartWatcher}
                disabled={loading}
                className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded transition disabled:opacity-50 font-semibold"
              >
                {loading ? 'Activando...' : 'Activar vigilancia'}
              </button>
              <button
                onClick={handleClose}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
