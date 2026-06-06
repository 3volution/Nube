import { createClient } from '@supabase/supabase-js';
import { sendCallAlert } from '@/app/services/notification-service';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables not configured');
  return createClient(url, key);
}

/**
 * POST /api/twilio/call-status
 * StatusCallback de Twilio. Se invoca cuando una llamada termina (cualquier motivo).
 *
 * Lógica de reintentos:
 * - La llamada es solo una alarma acústica. Su resultado (contestada, rechazada, no contestada)
 *   NO determina si se relanza. Solo importa el estado de la alerta en la BD.
 * - Si status='confirmed' → usuario canceló desde la web → no relanzar
 * - Si call_attempt >= max_attempts → expirar alerta
 * - En cualquier otro caso → lanzar siguiente llamada inmediatamente
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const callSid = formData.get('CallSid');
    const callStatus = formData.get('CallStatus');

    if (!callSid) {
      return new Response('Missing CallSid', { status: 400 });
    }

    const supabase = getSupabaseClient();

    // Buscar la alerta por el call_sid de la llamada que acaba de terminar
    const { data: alert, error: findError } = await supabase
      .from('watcher_call_events')
      .select('*')
      .eq('call_sid', callSid)
      .maybeSingle();

    if (findError) {
      console.error('call-status - error buscando alerta:', findError.message);
      return new Response('OK', { status: 200 });
    }

    if (!alert) {
      // Llamada huérfana (no encontrada en BD) - ignorar
      return new Response('OK', { status: 200 });
    }

    // Si el usuario ya confirmó desde la web → detener cadena
    if (alert.status === 'confirmed') {
      return new Response('OK', { status: 200 });
    }

    // Si ya expiró → no hacer nada
    if (alert.status === 'expired') {
      return new Response('OK', { status: 200 });
    }

    // Comprobar si se alcanzó el máximo de intentos
    if (alert.call_attempt >= alert.max_attempts) {
      // Expirar la alerta y completar el watcher
      await supabase
        .from('watcher_call_events')
        .update({ status: 'expired' })
        .eq('id', alert.id);

      await supabase
        .from('active_watchers')
        .update({ status: 'completed' })
        .eq('id', alert.watcher_id);

      return new Response('OK', { status: 200 });
    }

    // Lanzar siguiente llamada inmediatamente
    const nextAttempt = alert.call_attempt + 1;

    const callResult = await sendCallAlert({
      phoneNumber: process.env.TWILIO_CALL_RECIPIENT,
      stationName: alert.station_name,
      attempt: nextAttempt,
    });

    if (callResult.success) {
      await supabase
        .from('watcher_call_events')
        .update({
          call_attempt: nextAttempt,
          call_sid: callResult.callSid,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', alert.id);
    } else {
      console.error('call-status - fallo al lanzar siguiente llamada:', callResult.error);
    }

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('call-status - error general:', error.message);
    return new Response('OK', { status: 200 }); // Siempre 200 para Twilio
  }
}
