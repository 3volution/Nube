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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twilioPhone, setTwilioPhone] = useState(process.env.NEXT_PUBLIC_TWILIO_CALL_RECIPIENT || '');
  const [twilioLoading, setTwilioLoading] = useState(false);
  const [twilioResult, setTwilioResult] = useState<{ status: 'success' | 'error'; message: string } | null>(null);

  const handleTestTwilio = async () => {
    if (!twilioPhone.trim()) {
      setTwilioResult({ status: 'error', message: 'Ingresa un número de teléfono válido' });
      return;
    }

    setTwilioLoading(true);
    setTwilioResult(null);

    try {
      const response = await fetch('/api/twilio/test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: twilioPhone,
          station_name: station.name
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setTwilioResult({
          status: 'error',
          message: data.error || `Error: ${response.status}`
        });
        return;
      }

      setTwilioResult({
        status: 'success',
        message: 'Llamada enviada. Deberías recibir una llamada en tu teléfono en unos segundos.'
      });
    } catch {
      setTwilioResult({
        status: 'error',
        message: 'Error al conectar con el servidor'
      });
    } finally {
      setTwilioLoading(false);
    }
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
          // Ya existe vigilancia activa — tratar como éxito silencioso
          onStart({ station_id: station.id, already_active: true });
          handleClose();
          return;
        }
        if (response.status === 422) {
          // Ya hay un cargador libre: mostrar mensaje informativo y cerrar
          setError(data.error || 'Ya existe un cargador libre en esta estación.');
          setLoading(false);
          return;
        }
        if (response.status === 503) {
          setError('No se pudo consultar el estado de la estación. Inténtalo de nuevo en unos segundos.');
          setLoading(false);
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
    setError(null);
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-lg max-w-md w-full mx-4 border border-slate-700 max-h-[90vh] overflow-y-auto">
        <h2 className="text-white text-xl font-bold mb-1">
          {isWatching ? 'Vigilancia activa' : 'Vigilar estación'}
        </h2>
        <p className="text-slate-400 text-sm mb-6">{station.name}</p>

        {isWatching ? (
          <>
            <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-600 rounded">
              <p className="text-yellow-200 text-sm">
                Esta estación tiene vigilancia activa. Recibirás una llamada cuando un cargador quede libre.
              </p>
            </div>

            {/* SECCIÓN PRUEBA TWILIO - SOLO DESPUÉS DE AUTENTICARSE */}
            <div className="mb-6 p-4 bg-slate-700 border border-slate-600 rounded">
              <h3 className="text-slate-100 text-sm font-semibold mb-3">Prueba de Notificación Twilio</h3>
              
              <label className="block text-slate-300 text-xs font-medium mb-2">
                Número destino
              </label>
              <input
                type="tel"
                value={twilioPhone}
                onChange={(e) => setTwilioPhone(e.target.value)}
                placeholder="+34612345678"
                className="w-full px-3 py-2 bg-slate-600 text-white rounded border border-slate-500 focus:border-blue-500 outline-none text-sm mb-3"
                disabled={twilioLoading}
              />

              <button
                onClick={handleTestTwilio}
                disabled={twilioLoading || !twilioPhone}
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold transition disabled:opacity-50 mb-2"
              >
                {twilioLoading ? 'Enviando...' : '▶ Probar Llamada'}
              </button>

              {twilioResult && (
                <div className={`p-2 rounded text-xs ${
                  twilioResult.status === 'success'
                    ? 'bg-green-900/50 border border-green-600 text-green-200'
                    : 'bg-red-900/50 border border-red-600 text-red-200'
                }`}>
                  {twilioResult.status === 'success' ? '✓' : '✗'} {twilioResult.message}
                </div>
              )}
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

            {/* SECCIÓN PRUEBA TWILIO - SOLO DESPUÉS DE AUTENTICARSE */}
            <div className="mb-6 p-4 bg-slate-700 border border-slate-600 rounded">
              <h3 className="text-slate-100 text-sm font-semibold mb-3">Prueba de Notificación Twilio</h3>
              
              <label className="block text-slate-300 text-xs font-medium mb-2">
                Número destino
              </label>
              <input
                type="tel"
                value={twilioPhone}
                onChange={(e) => setTwilioPhone(e.target.value)}
                placeholder="+34612345678"
                className="w-full px-3 py-2 bg-slate-600 text-white rounded border border-slate-500 focus:border-blue-500 outline-none text-sm mb-3"
                disabled={twilioLoading}
              />

              <button
                onClick={handleTestTwilio}
                disabled={twilioLoading || !twilioPhone}
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold transition disabled:opacity-50 mb-2"
              >
                {twilioLoading ? 'Enviando...' : '▶ Probar Llamada'}
              </button>

              {twilioResult && (
                <div className={`p-2 rounded text-xs ${
                  twilioResult.status === 'success'
                    ? 'bg-green-900/50 border border-green-600 text-green-200'
                    : 'bg-red-900/50 border border-red-600 text-red-200'
                }`}>
                  {twilioResult.status === 'success' ? '✓' : '✗'} {twilioResult.message}
                </div>
              )}
            </div>

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
