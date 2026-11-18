import { createClient } from '@supabase/supabase-js';
import { obtenerDatosEstacion } from '@/api/electromaps';
import {
  ALERT_COUNT,
  ALERT_INTERVAL_MS,
  getToyotaChrTelegram,
  sendToyotaChrAlert,
  waitBetweenAlerts,
} from '@/app/services/watcher-telegram-service';

// Cinco envíos y cuatro intervalos de 1 segundo, más las peticiones de red/BD.
export const maxDuration = 30;

function getSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase no configurado');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function completeWatcher(supabase, watcherId) {
  const { error: alertError } = await supabase
    .from('watcher_telegram_alerts')
    .update({ status: 'completed', completed_at: new Date().toISOString(), last_error: null })
    .eq('watcher_id', watcherId)
    .eq('sent_count', ALERT_COUNT);
  if (alertError) throw alertError;

  const { error: watcherError } = await supabase
    .from('active_watchers')
    .update({ status: 'completed' })
    .eq('id', watcherId)
    .eq('status', 'active');
  if (watcherError) throw watcherError;
}

async function deliverAlertSeries(supabase, watcher, alert) {
  let sent = alert.sent_count;
  if (sent === ALERT_COUNT) {
    await completeWatcher(supabase, watcher.id);
    return 0;
  }

  try {
    // getMe asegura que estamos utilizando @RiderCHRbot y no otro bot del proyecto.
    const telegram = await getToyotaChrTelegram();
    let sentInThisRun = 0;

    for (let number = sent + 1; number <= ALERT_COUNT; number++) {
      if (number > sent + 1) {
        await waitBetweenAlerts(ALERT_INTERVAL_MS);
      }

      await sendToyotaChrAlert(telegram, {
        stationName: alert.station_name,
        connectorId: alert.connector_id,
        sequenceNumber: number,
      });

      const { error } = await supabase
        .from('watcher_telegram_alerts')
        .update({ sent_count: number, last_sent_at: new Date().toISOString(), last_error: null })
        .eq('watcher_id', watcher.id)
        .eq('status', 'sending');
      if (error) throw error;

      sentInThisRun++;
      sent = number;
    }

    // Sólo finalizar después de confirmar cinco envíos correctos.
    await completeWatcher(supabase, watcher.id);
    return sentInThisRun;
  } catch (error) {
    // Ante fallo no reiniciar la serie desde cero: el siguiente scheduler
    // reclama la alerta y continúa desde sent_count, evitando 5+ avisos.
    const { error: recordError } = await supabase
      .from('watcher_telegram_alerts')
      .update({ status: 'failed', last_error: String(error.message || error).slice(0, 500) })
      .eq('watcher_id', watcher.id)
      .eq('status', 'sending');
    if (recordError) console.error('watcher/check - fallo al registrar error:', recordError.message);
    throw error;
  }
}

async function claimRetry(supabase, alert) {
  // Un envío normal dura unos segundos; transcurridos 90 s reclamamos un
  // intento interrumpido (por timeout), sin permitir concurrencia entre crons.
  const expired = new Date(Date.now() - 90_000).toISOString();
  if (alert.status === 'sending' && new Date(alert.claimed_at) > new Date(expired)) {
    return null;
  }
  if (alert.status === 'completed') return null;

  let query = supabase
    .from('watcher_telegram_alerts')
    .update({
      status: 'sending',
      claimed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('watcher_id', alert.watcher_id)
    .eq('status', alert.status)
    .eq('claimed_at', alert.claimed_at);
  if (alert.status === 'sending') query = query.lt('claimed_at', expired);

  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw error;
  return data; // null cuando otro proceso ya reclamó la alerta
}

/**
 * GET /api/watcher/check (CRON_SECRET por Bearer o query legacy)
 *
 * Un watcher dispara UNA serie cuando detecta OCCUPIED -> FREE/AVAILABLE.
 * Telegram Toyota CHR recibe 5 mensajes, con 1 s ENTRE mensajes.
 * Tras el quinto envío el watcher pasa a completed.
 *
 * El scheduler debe invocar este endpoint regularmente (por ejemplo, cada minuto).
 * No usa Twilio ni el callback de llamadas.
 */
export async function GET(request) {
  const supplied = request.headers.get('authorization');
  const querySecret = new URL(request.url).searchParams.get('secret');
  const expected = process.env.CRON_SECRET;
  if (!expected || (supplied !== `Bearer ${expected}` && querySecret !== expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseClient();
    const { data: watchers, error: watcherError } = await supabase
      .from('active_watchers')
      .select('*')
      .eq('status', 'active');
    if (watcherError) throw watcherError;

    if (!watchers?.length) {
      return Response.json({ success: true, checked: 0, telegram_sent: 0, completed: 0 });
    }

    let sent = 0;
    let completed = 0;
    const errors = [];

    for (const watcher of watchers) {
      try {
        const { data: pending, error: pendingError } = await supabase
          .from('watcher_telegram_alerts')
          .select('*')
          .eq('watcher_id', watcher.id)
          .maybeSingle();
        if (pendingError) throw pendingError;

        if (pending) {
          if (pending.status === 'completed') {
            await completeWatcher(supabase, watcher.id);
            completed++;
          } else {
            const claimed = await claimRetry(supabase, pending);
            if (claimed) {
              sent += await deliverAlertSeries(supabase, watcher, claimed);
              completed += 1;
            }
          }
          continue;
        }

        const user = process.env.ELECTROMAPS_USER;
        const pass = process.env.ELECTROMAPS_PASS;
        if (!user || !pass) throw new Error('Credenciales Electromaps no configuradas');
        const connectors = await obtenerDatosEstacion(watcher.station_id, user, pass);
        if (!Array.isArray(connectors) || !connectors.length) {
          console.warn('watcher/check - sin conectores:', watcher.station_id);
          continue;
        }

        const previous = watcher.last_connector_states || {};
        const current = Object.fromEntries(
          connectors.map(connector => [String(connector.id), connector.status])
        );
        const freedId = Object.keys(current).find(id =>
          previous[id] === 'OCCUPIED' &&
          (current[id] === 'FREE' || current[id] === 'AVAILABLE')
        );

        // IMPORTANTE: también tras una liberación, para no redetectarla.
        const { error: stateError } = await supabase
          .from('active_watchers')
          .update({ last_connector_states: current })
          .eq('id', watcher.id)
          .eq('status', 'active');
        if (stateError) throw stateError;
        if (!freedId) continue;

        // Una única fila por vigilancia = reserva anti-duplicados.
        // En caso de 23505, otro proceso ha reservado el envío.
        const { data: reserved, error: insertError } = await supabase
          .from('watcher_telegram_alerts')
          .insert({
            watcher_id: watcher.id,
            station_id: String(watcher.station_id),
            station_name: watcher.station_name,
            connector_id: String(freedId),
            status: 'sending',
            sent_count: 0,
          })
          .select('*')
          .single();
        if (insertError?.code === '23505') continue;
        if (insertError) throw insertError;

        console.log('watcher/check - liberacion detectada:', watcher.station_id, freedId);
        sent += await deliverAlertSeries(supabase, watcher, reserved);
        completed++;
      } catch (error) {
        console.error('watcher/check - error:', watcher.station_id, error.message);
        errors.push({ station_id: String(watcher.station_id), error: error.message });
      }
    }

    return Response.json({
      success: errors.length === 0,
      checked: watchers.length,
      telegram_sent: sent,
      completed,
      errors,
    }, { status: errors.length ? 207 : 200 });
  } catch (error) {
    console.error('watcher/check - error general:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
