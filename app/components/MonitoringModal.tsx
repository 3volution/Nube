'use client';

import { useState } from 'react';

export function MonitoringModal({ station, isOpen, onClose, onStart }) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [testingCall, setTestingCall] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const handleAuthenticate = () => {
    const CORRECT_PIN = 'NACHO';

    if (pin.toUpperCase() !== CORRECT_PIN) {
      setError('Código incorrecto');
      setPin('');
      return;
    }

    setError(null);
    setIsAuthenticated(true);
  };

  const handleStart = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: station.id,
          station_name: station.name
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Si el monitoreo ya está activo, también cerramos y marcamos como activo
        if (response.status === 409) {
          console.log('[v0] Monitoreo ya activo, cerrando modal');
          onStart({ station_id: station.id, already_active: true });
          setLoading(false);
          setPin('');
          setIsAuthenticated(false);
          onClose();
          return;
        }
        setError(data.error || 'Error al iniciar monitoreo');
        setLoading(false);
        return;
      }

      console.log('[v0] Monitoreo iniciado:', data);
      onStart(data.monitoring);
      setLoading(false);
      setPin('');
      setIsAuthenticated(false);
      onClose();
    } catch (err) {
      console.error('[v0] Error:', err);
      setError('Error al conectar con el servidor');
      setLoading(false);
    }
  };

  const handleTestCall = async () => {
    setTestingCall(true);
    setTestResult(null);
    setError(null);

    try {
      const response = await fetch('/api/twilio/test-call', {
        method: 'POST'
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Error al hacer la llamada de prueba');
        setTestingCall(false);
        return;
      }

      setTestResult('Llamada de prueba iniciada. Recibirás una llamada en breve.');
      setTestingCall(false);
    } catch (err) {
      console.error('[v0] Error test call:', err);
      setError('Error al conectar con el servidor');
      setTestingCall(false);
    }
  };

  const handleClose = () => {
    setPin('');
    setIsAuthenticated(false);
    setError(null);
    setTestResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-lg max-w-md w-full mx-4 border border-slate-700">
        <h2 className="text-white text-xl font-bold mb-4">Monitorear: {station.name}</h2>
        
        {!isAuthenticated ? (
          <>
            <p className="text-slate-300 text-sm mb-6">
              Ingresa el código de activación para continuar.
            </p>

            <div className="mb-4">
              <label className="block text-slate-300 text-sm font-semibold mb-2">Código de activación</label>
              <div className="flex gap-2 justify-center mb-3">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div
                    key={index}
                    className="w-10 h-10 bg-slate-700 border border-slate-600 rounded flex items-center justify-center"
                  >
                    {pin.length > index && <span className="text-2xl">●</span>}
                  </div>
                ))}
              </div>
              <input
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value.slice(0, 5))}
                maxLength="5"
                placeholder=""
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
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50 font-semibold"
                disabled={pin.length !== 5}
              >
                Continuar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-slate-300 text-sm mb-6">
              Recibirás una llamada telefónica cuando se encuentre un cargador disponible. El monitoreo continuará hasta que lo desactives.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 text-red-200 rounded text-sm">
                {error}
              </div>
            )}

            {testResult && (
              <div className="mb-4 p-3 bg-green-900/50 border border-green-700 text-green-200 rounded text-sm">
                {testResult}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleStart}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50 font-semibold"
                disabled={loading}
              >
                {loading ? 'Activando...' : 'Activar Monitoreo'}
              </button>

              <button
                onClick={handleTestCall}
                className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded transition disabled:opacity-50"
                disabled={testingCall}
              >
                {testingCall ? 'Llamando...' : 'Probar Llamada Twilio'}
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
