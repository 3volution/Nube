'use client';

import { useEffect, useState } from 'react';

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

export function WatcherModal({ station, isOpen, isWatching, onClose, onStart, onCancel }: WatcherModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegramReady, setTelegramReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setTelegramReady(null);
    fetch('/api/watcher/telegram-health', { cache: 'no-store' })
      .then(response => response.json())
      .then(data => { if (active) setTelegramReady(data.verified === true); })
      .catch(() => { if (active) setTelegramReady(false); });
    return () => { active = false; };
  }, [isOpen]);

  const close = () => {
    setError(null);
    setLoading(false);
    onClose();
  };

  const start = async () => {
    if (telegramReady !== true) {
      setError('Telegram Toyota CHR no está verificado. No se puede activar la vigilancia.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/watcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station_id: station.id, station_name: station.name }),
      });
      const data = await response.json();
      if (response.status === 409) {
        onStart({ station_id: station.id, already_active: true });
        close();
        return;
      }
      if (!response.ok) {
        setError(data.error || 'No se pudo activar la vigilancia');
        return;
      }
      onStart({ station_id: station.id, ...data.watcher });
      close();
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/watcher?station_id=${encodeURIComponent(String(station.id))}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'No se pudo cancelar la vigilancia');
        return;
      }
      onCancel({ station_id: station.id });
      close();
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-lg max-w-md w-full mx-4 border border-slate-700">
        <h2 className="text-white text-xl font-bold mb-1">
          {isWatching ? 'Vigilancia activa' : 'Vigilar estación'}
        </h2>
        <p className="text-slate-400 text-sm mb-6">{station.name}</p>
        <div className="mb-6 p-4 bg-sky-950/40 border border-sky-700 rounded text-sky-100 text-sm">
          {isWatching
            ? 'Si un conector pasa de ocupado a libre, Toyota CHR enviará 5 avisos por Telegram separados por 1 segundo y después desactivará esta vigilancia.'
            : 'Al liberarse un conector recibirás 5 mensajes en Telegram Toyota CHR, separados por 1 segundo. Tras el quinto aviso, la vigilancia se desactiva automáticamente.'}
        </div>
        {telegramReady === false && !isWatching && (
          <div className="mb-4 p-3 rounded text-sm border bg-red-900/50 border-red-700 text-red-200" role="alert">
            Telegram Toyota CHR no está configurado o validado. Se ha bloqueado la activación para evitar perder avisos.
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded text-sm border bg-red-900/50 border-red-700 text-red-200" role="alert">
            ⚠️ {error}
          </div>
        )}
        <div className="flex flex-col gap-3">
          <button
            onClick={isWatching ? cancel : start}
            disabled={loading || (!isWatching && telegramReady !== true)}
            className={`w-full px-4 py-3 rounded transition disabled:opacity-50 font-semibold text-white ${isWatching
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-amber-600 hover:bg-amber-700'}`}
          >
            {loading
              ? (isWatching ? 'Cancelando...' : 'Activando...')
              : (isWatching ? 'Cancelar vigilancia' : 'Activar vigilancia')}
          </button>
          <button onClick={close} disabled={loading} className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
