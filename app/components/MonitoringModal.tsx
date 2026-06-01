'use client';

import { useState } from 'react';

export function MonitoringModal({ station, isOpen, onClose, onStart }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [selectedMethods, setSelectedMethods] = useState({
    telegram: true,
    sms: true,
    twilio: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleMethodToggle = (method) => {
    setSelectedMethods(prev => ({
      ...prev,
      [method]: !prev[method]
    }));
  };

  const handleStart = async () => {
    setError(null);

    // Validar datos
    if (!phoneNumber && !telegramChatId) {
      setError('Debes proporcionar al menos un teléfono o ID de Telegram');
      return;
    }

    if (!Object.values(selectedMethods).some(v => v)) {
      setError('Debes seleccionar al menos un método de notificación');
      return;
    }

    setLoading(true);

    try {
      const notificationMethods = [];
      if (selectedMethods.telegram && telegramChatId) notificationMethods.push('telegram');
      if (selectedMethods.sms && phoneNumber) notificationMethods.push('sms');
      if (selectedMethods.twilio && phoneNumber) notificationMethods.push('twilio');

      const response = await fetch('/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: station.id,
          station_name: station.name,
          phone_number: phoneNumber,
          telegram_chat_id: telegramChatId,
          notification_methods: notificationMethods,
          duration_minutes: durationMinutes
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error iniciando monitoreo');
      }

      const monitoringData = await response.json();
      onStart(monitoringData);
      
      // Limpiar formulario y cerrar
      setPhoneNumber('');
      setTelegramChatId('');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 border border-slate-700">
        <h2 className="text-xl font-bold text-white mb-4">
          Monitorear {station.name}
        </h2>

        {error && (
          <div className="bg-red-900/30 border border-red-600 text-red-300 px-3 py-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Métodos de notificación */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-300 mb-3">
            Métodos de notificación (orden de cascada):
          </label>
          
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-2 bg-slate-700 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={selectedMethods.telegram}
                onChange={() => handleMethodToggle('telegram')}
                className="w-4 h-4"
              />
              <span className="text-sm text-slate-200">Telegram (Gratis - 10 mensajes)</span>
            </label>

            <label className="flex items-center gap-3 p-2 bg-slate-700 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={selectedMethods.sms}
                onChange={() => handleMethodToggle('sms')}
                className="w-4 h-4"
              />
              <span className="text-sm text-slate-200">SMS (~$0.06-0.08)</span>
            </label>

            <label className="flex items-center gap-3 p-2 bg-slate-700 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={selectedMethods.twilio}
                onChange={() => handleMethodToggle('twilio')}
                className="w-4 h-4"
              />
              <span className="text-sm text-slate-200">Llamada Twilio (~$0.15-0.30/min)</span>
            </label>
          </div>
        </div>

        {/* Telegram Chat ID */}
        {selectedMethods.telegram && (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              ID del Chat de Telegram
            </label>
            <input
              type="text"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="Presiona el botón para conectar tu bot"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            />
            <button
              className="mt-2 w-full px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition"
              onClick={() => window.open('https://t.me/your_bot', '_blank')}
            >
              Conectar Bot Telegram
            </button>
          </div>
        )}

        {/* Teléfono */}
        {(selectedMethods.sms || selectedMethods.twilio) && (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Número de teléfono
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+34 600 000 000"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            />
          </div>
        )}

        {/* Duración */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Duración del monitoreo: {durationMinutes} minutos
          </label>
          <input
            type="range"
            min="30"
            max="120"
            step="30"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex gap-2 mt-2 text-xs text-slate-400">
            <button onClick={() => setDurationMinutes(30)} className="px-2 py-1 bg-slate-700 rounded hover:bg-slate-600">30m</button>
            <button onClick={() => setDurationMinutes(60)} className="px-2 py-1 bg-slate-700 rounded hover:bg-slate-600">60m</button>
            <button onClick={() => setDurationMinutes(90)} className="px-2 py-1 bg-slate-700 rounded hover:bg-slate-600">90m</button>
            <button onClick={() => setDurationMinutes(120)} className="px-2 py-1 bg-slate-700 rounded hover:bg-slate-600">120m</button>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleStart}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition disabled:opacity-50"
          >
            {loading ? 'Iniciando...' : 'Iniciar Monitoreo'}
          </button>
        </div>
      </div>
    </div>
  );
}
