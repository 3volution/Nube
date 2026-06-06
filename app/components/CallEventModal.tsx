'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

interface CallEvent {
  id: number;
  station_name: string;
  station_id: string;
  connector_id: string | null;
  previous_status: string | null;
  current_status: string | null;
  called_at: string;
  acknowledged: boolean;
}

function formatCalledAt(isoString: string): string {
  try {
    const date = new Date(isoString);
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    const secs = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${mins}:${secs}`;
  } catch {
    return isoString;
  }
}

export function CallEventModal() {
  const [event, setEvent] = useState<CallEvent | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const loadPendingEvent = useCallback(async () => {
    const { data, error } = await supabase
      .from('watcher_call_events')
      .select('*')
      .eq('acknowledged', false)
      .order('called_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setEvent(data);
    }
  }, []);

  useEffect(() => {
    // Carga inicial
    loadPendingEvent();

    // Suscripción Realtime: detecta nuevas filas en watcher_call_events
    const channel = supabase
      .channel('watcher_call_events_inserts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'watcher_call_events',
          filter: 'acknowledged=eq.false'
        },
        (payload) => {
          setEvent(payload.new as CallEvent);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPendingEvent]);

  const handleAcknowledge = async () => {
    if (!event) return;
    setAcknowledging(true);

    await supabase
      .from('watcher_call_events')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString()
      })
      .eq('id', event.id);

    setEvent(null);
    setAcknowledging(false);
  };

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-slate-900 border border-amber-500 rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
        {/* Franja de alerta superior */}
        <div className="bg-amber-500 px-5 py-3 flex items-center gap-3">
          <span className="text-slate-900 font-bold text-lg tracking-wide uppercase">
            Cargador libre
          </span>
        </div>

        {/* Contenido */}
        <div className="px-6 py-6">
          <p className="text-white text-2xl font-bold mb-1">{event.station_name}</p>
          <p className="text-slate-400 text-sm mb-6">
            Liberacion detectada a las {formatCalledAt(event.called_at)}
          </p>

          <div className="bg-slate-800 rounded-lg p-4 mb-6 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Conector</span>
              <span className="text-white font-mono">{event.connector_id || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Estado anterior</span>
              <span className="text-red-400 font-semibold">{event.previous_status || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Estado actual</span>
              <span className="text-green-400 font-semibold">{event.current_status || '—'}</span>
            </div>
          </div>

          <p className="text-slate-300 text-sm mb-6 leading-relaxed">
            Has recibido una llamada de Twilio. Confirma cuando hayas conectado el vehiculo para desactivar esta alerta.
          </p>

          <button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-lg transition-colors disabled:opacity-50 text-base"
          >
            {acknowledging ? 'Confirmando...' : 'Confirmar — ya he llegado'}
          </button>
        </div>
      </div>
    </div>
  );
}
