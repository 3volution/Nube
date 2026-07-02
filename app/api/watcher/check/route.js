import { createClient } from '@supabase/supabase-js';
import { obtenerDatosEstacion } from '@/api/electromaps';
import { sendCallAlert } from '@/app/services/notification-service';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables not configured');
  return createClient(url, key);
}

/**
 * GET /api/watcher/check
 * Invocado cada minuto por cron-job.org (?secret=CRON_SECRET)
 * o por Vercel Cron (header x-vercel-cron).
 *
 * Lógica:
 * 1. Sin vigilancias activas → retorna sin consultar Electromaps
 * 2. Para cada vigilancia activa → consulta Electromaps
 * 3. Compara estado actual vs last_connector_states
 * 4. Si OCCUPIED → FREE/AVAILABLE y NO existe alerta 'ringing' activa:
 *    - Inserta fila en watcher_call_events (status='ringing', attempt=1)
 *    - Lanza llamada Twilio con timeout=14 y statusCallback
 * 5. Si ya existe alerta 'ringing' → no hace nada (StatusCallback gestiona reintentos)
 * 6. Si no hay liberación → actualiza last_connector_states
 */
export async function GET(request) {
  try {
    const vercelCronHeader = request.headers.get('x-vercel-cron');
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    const isFromVercelCron = vercelCronHeader === 'true';
    const isAuthorizedCronJob = secret === process.env.CRON_SECRET;

    if (!isFromVercelCron && !isAuthorizedCronJob) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    const { data: watchers, error: fetchError } = await supabase
      .from('active_watchers')
      .select('*')
      .eq('status', 'active');

    if (fetchError) {
      console.error('watcher/check - error BD:', fetchError.message);
      return Response.json({ error: fetchError.message }, { status: 500 });
    }

    if (!watchers || watchers.length === 0) {
      return Response.json({ success: true, checked: 0, calls_made: 0 }, { status: 200 });
    }

    const user = process.env.ELECTROMAPS_USER;
    const pass = process.env.ELECTROMAPS_PASS;

    if (!user || !pass) {
      return Response.json({ error: 'Credenciales Electromaps no configuradas' }, { status: 500 });
    }

    let callsMade = 0;

    for (const watcher of watchers) {
      try {
        const conectores = await obtenerDatosEstacion(watcher.station_id, user, pass);

        if (!conectores || conectores.length === 0) continue;

        const currentStates = {};
        conectores.forEach(c => { currentStates[c.id] = c.status; });

        const previousStates = watcher.last_connector_states || {};

        // Buscar conector liberado: OCCUPIED → FREE o AVAILABLE
        let freedConnectorId = null;
        let freedPrevStatus = null;
        let freedCurrStatus = null;

        for (const connectorId of Object.keys(currentStates)) {
          const prev = previousStates[connectorId];
          const curr = currentStates[connectorId];
          if (prev === 'OCCUPIED' && (curr === 'FREE' || curr === 'AVAILABLE')) {
            freedConnectorId = connectorId;
            freedPrevStatus = prev;
            freedCurrStatus = curr;
            break;
          }
        }

        if (freedConnectorId) {
          // 🔥 ESCRIBIR EN chargeHistory cuando se detecta FIN DE CARGA
          const freedConnector = conectores.find(c => c.id === freedConnectorId);
          if (freedConnector) {
            const chargeEndTime = new Date().toISOString();
            const chargeStartTime = freedConnector.status_changed_at || chargeEndTime;
            
            const durationMinutes = Math.floor(
              (new Date(chargeEndTime) - new Date(chargeStartTime)) / 60000
            );
            const isOverLimit = durationMinutes > 120; // > 2 horas = sancionable
            
            await supabase.from('chargeHistory').insert({
              connector_id: freedConnectorId,
              station_id: String(watcher.station_id),
              station_name: watcher.station_name,
              started_at: chargeStartTime,
              ended_at: chargeEndTime,
              timestamp: chargeEndTime,
              durationMinutes: durationMinutes,
              isOverLimit: isOverLimit,
              isCompleted: true
            });

            // Escribir en connector_state_changes con los campos correctos de la tabla
            const now = new Date(chargeEndTime);
            const fecha = now.toISOString().split('T')[0]; // YYYY-MM-DD
            const hora = now.toTimeString().split(' ')[0]; // HH:MM:SS
            const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
            const dia = diasSemana[now.getDay()];
            const durationSeconds = Math.floor(
              (new Date(chargeEndTime) - new Date(chargeStartTime)) / 1000
            );

            const { error: stateChangeError } = await supabase.from('connector_state_changes').insert({
              connector_id: String(freedConnectorId),
              station_id: String(watcher.station_id),
              station_name: watcher.station_name,
              estado_anterior: freedPrevStatus,
              estado_nuevo: freedCurrStatus,
              fecha: fecha,
              dia: dia,
              hora: hora,
              timestamp: chargeEndTime,
              tiempo_en_estado_anterior_segundos: durationSeconds
            });

            if (stateChangeError) {
              console.error('watcher/check - error insertando state_change:', stateChangeError.message);
            }
          }

          // Comprobar si ya existe una alerta activa (ringing) para este watcher
          const { data: existingAlert } = await supabase
            .from('watcher_call_events')
            .select('id')
            .eq('watcher_id', watcher.id)
            .eq('status', 'ringing')
            .maybeSingle();

          if (existingAlert) {
            // Ya hay un ciclo de reintentos activo gestionado por StatusCallback
            // No insertar nueva alerta ni lanzar nueva llamada
            continue;
          }

          // Primera detección: insertar alerta y lanzar llamada 1
          const callResult = await sendCallAlert({
            phoneNumber: process.env.TWILIO_CALL_RECIPIENT,
            stationName: watcher.station_name,
            attempt: 1,
          });

          if (callResult.success) {
            callsMade++;

            await supabase
              .from('watcher_call_events')
              .insert({
                watcher_id: watcher.id,
                station_name: watcher.station_name,
                station_id: String(watcher.station_id),
                call_attempt: 1,
                max_attempts: 5,
                status: 'ringing',
                call_sid: callResult.callSid,
                last_attempt_at: new Date().toISOString(),
                trigger_connector_id: String(freedConnectorId),
                trigger_previous_status: freedPrevStatus,
                trigger_current_status: freedCurrStatus,
                acknowledged: false,
              });

            // El watcher permanece 'active' hasta confirmed o expired
          } else {
            console.error('watcher/check - Twilio falló en llamada 1:', callResult.error);
          }

        } else {
          // Sin liberación detectada: actualizar estados para siguiente iteración
          await supabase
            .from('active_watchers')
            .update({ last_connector_states: currentStates })
            .eq('id', watcher.id);
        }

      } catch (stationError) {
        console.error(`watcher/check - error estación ${watcher.station_id}:`, stationError.message);
      }
    }

    return Response.json({
      success: true,
      checked: watchers.length,
      calls_made: callsMade
    }, { status: 200 });

  } catch (error) {
    console.error('watcher/check - error general:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
