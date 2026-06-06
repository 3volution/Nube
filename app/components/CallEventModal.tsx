'use client';

import { useEffect, useState } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface CallEvent {
  id: number;
  watcher_id: string;
  station_name: string;
  station_id: string;
  trigger_connector_id: string | null;
  trigger_previous_status: string | null;
  trigger_current_status: string | null;
  call_attempt: number;
  max_attempts: number;
  status: 'ringing' | 'confirmed' | 'expired';
  called_at: string;
  last_attempt_at: string | null;
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return isoString;
  }
}

export function CallEventModal() {
  const [event, setEvent] = useState<CallEvent | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    setSupabase(createClient(url, key));
  }, []);

  useEffect(() => {
    if (!supabase) return;

    // Carga inicial: busca alerta activa (ringing) pendiente
    supabase
      .from('watcher_call_events')
      .select('*')
      .eq('status', 'ringing')
      .order('called_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) setEvent(data as CallEvent);
      });

    // Realtime: INSERT de nueva alerta
    const channel = supabase
      .channel('call_events_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'watcher_call_events' },
        (payload) => {
          const newEvent = payload.new as CallEvent;
          if (newEvent.status === 'ringing') {
            setEvent(newEvent);
          }
        }
      )
      // Realtime: UPDATE de alerta existente (call_attempt, status)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'watcher_call_events' },
        (payload) => {
          const updated = payload.new as CallEvent;
          setEvent(prev => {
            if (!prev || prev.id !== updated.id) return prev;
            // Si expiró → cerrar modal
            if (updated.status === 'expired' || updated.status === 'confirmed') {
              return null;
            }
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const handleCancel = async () => {
    if (!event || !supabase) return;
    setCancelling(true);

    // Confirmar alerta desde la web (fuente de verdad)
    await supabase
      .from('watcher_call_events')
      .update({
        status: 'confirmed',
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', event.id);

    // Marcar vigilancia como completada
    await supabase
      .from('active_watchers')
      .update({ status: 'completed' })
      .eq('id', event.watcher_id);

    setEvent(null);
    setCancelling(false);
  };

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-amber-500 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">

        {/* Cabecera */}
        <div className="bg-amber-500 px-5 py-4">
          <p className="text-slate-900 font-bold text-lg tracking-wide">
            Se acaba de liberar un cargador
          </p>
        </div>

        {/* Cuerpo */}
        <div className="px-6 py-6 space-y-5">

          {/* Estación */}
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Estacion vigilada</p>
            <p className="text-white text-2xl font-bold leading-tight">{event.station_name}</p>
          </div>

          {/* Detalles */}
          <div className="bg-slate-800 rounded-xl p-4 space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Hora del evento</span>
              <span className="text-white font-mono">{formatTime(event.called_at)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Intento actual</span>
              <span className="text-amber-400 font-bold text-base">
                {event.call_attempt} / {event.max_attempts}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Estado</span>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
                <span className="text-amber-400 font-semibold capitalize">Llamando</span>
              </span>
            </div>
            {event.trigger_connector_id && (
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Transicion</span>
                <span className="text-slate-300 font-mono text-xs">
                  {event.trigger_previous_status} &rarr; {event.trigger_current_status}
                </span>
              </div>
            )}
          </div>

          {/* Instruccion */}
          <p className="text-slate-400 text-sm leading-relaxed">
            Recibes llamadas de aviso hasta que canceles la alerta desde aqui. La llamada es solo un aviso sonoro.
          </p>

          {/* Boton principal */}
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-900 font-bold rounded-xl transition-colors disabled:opacity-50 text-base tracking-wide uppercase"
          >
            {cancelling ? 'Cancelando...' : 'Cancelar alerta'}
          </button>
        </div>
      </div>
    </div>
  );
}
