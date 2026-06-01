'use client';

import { useState } from 'react';

export function MonitoringModal({ station, isOpen, onClose, onStart }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleStart = async () => {
    if (!phoneNumber.trim()) {
      setError('Por favor ingresa tu número de teléfono');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: station.id,
          station_name: station.name,
          phone_number: phoneNumber
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Error al iniciar monitoreo');
        setLoading(false);
        return;
      }

      console.log('[v0] Monitoreo iniciado:', data);
      onStart(data.monitoring);
      setPhoneNumber('');
      onClose();
    } catch (err) {
      console.error('[v0] Error:', err);
      setError('Error al conectar con el servidor');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-lg max-w-md w-full mx-4 border border-slate-700">
        <h2 className="text-white text-xl font-bold mb-4">Monitorear: {station.name}</h2>
        
        <p className="text-slate-300 text-sm mb-4">
          Recibirás una llamada de Twilio cuando se encuentre un cargador disponible. El monitoreo continuará hasta que lo desactives.
        </p>

        <div className="mb-4">
          <label className="block text-slate-300 text-sm font-semibold mb-2">Tu número de teléfono</label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+34 600 000 000"
            className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 outline-none"
            disabled={loading}
          />
          <p className="text-slate-400 text-xs mt-1">Incluye el código de país (ej: +34)</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 text-red-200 rounded text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition disabled:opacity-50"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            onClick={handleStart}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50 font-semibold"
            disabled={loading}
          >
            {loading ? 'Iniciando...' : 'Iniciar Monitoreo'}
          </button>
        </div>
      </div>
    </div>
  );
}
