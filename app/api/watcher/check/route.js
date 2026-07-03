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
 *
 * Diseñado para ser invocado cada minuto por un scheduler externo
 * (cron-job.org, EasyCron, GitHub Actions, etc.) mediante:
 *
 *   GET /api/watcher/check?secret=<CRON_SECRET>
 *
 * Autenticación exclusiva mediante ?secret=<CRON_SECRET>.
 * NO acepta invocaciones de Vercel Cron (el endpoint no está en vercel.json).
 *
 * Razones del scheduler externo:
 * - Compatibilidad con Vercel Hobby (sin límite de frecuencia externa)
 * - La vigilancia funciona aunque el usuario cierre la web
 * - Menor complejidad que polling desde el cliente
 * - Misma funcionalidad que con Vercel Cron nativo
 *
 * Autenticación: query param ?secret=<CRON_SECRET> (env var).
 * El secret debe tener al menos 32 caracteres aleatorios.
 *
 * Lógica:
 * 1. Sin vigilancias activas → early exit, sin consultar Electromaps
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
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    // [DIAGNÓSTICO TEMPORAL - REMOVER DESPUÉS DE DEBUG]
    console.log('[v0-DIAG-CRON] Validación de secret:', {
      receivedLength: secret?.length,
      envLength: process.env.CRON_SECRET?.length,
      equal: secret === process.env.CRON_SECRET,
      receivedFirst8: secret?.slice(0, 8),
      envFirst8: process.env.CRON_SECRET?.slice(0, 8),
      receivedLast8: secret?.slice(-8),
      envLast8: process.env.CRON_SECRET?.slice(-8)
    });

    if (secret !== process.env.CRON_SECRET) {
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
        // [LOG 1] Iniciando vigilancia
        console.log('[v0-DIAG-WATCHER] Iniciando vigilancia:', {
          watcher_id: watcher.id,
          station_id: watcher.station_id,
          station_name: watcher.station_name,
          last_connector_states: watcher.last_connector_states
        });

        const conectores = await obtenerDatosEstacion(watcher.station_id, user, pass);

        // [LOG 2] Datos de Electromaps obtenidos
        console.log('[v0-DIAG-WATCHER] Datos de Electromaps obtenidos:', {
          station_id: watcher.station_id,
          conectores_count: conectores?.length,
          conectores: conectores?.map(c => ({ id: c.id, status: c.status }))
        });

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
          
          // [LOG 3] Comparación de estados
          console.log('[v0-DIAG-WATCHER] Comparación de estados:', {
            connector_id: connectorId,
            previousStatus: prev,
            currentStatus: curr,
            esDetectableComoLiberation: prev === 'OCCUPIED' && (curr === 'FREE' || curr === 'AVAILABLE')
          });

          if (prev === 'OCCUPIED' && (curr === 'FREE' || curr === 'AVAILABLE')) {
            freedConnectorId = connectorId;
            freedPrevStatus = prev;
            freedCurrStatus = curr;
            break;
          }
        }

        if (freedConnectorId) {
          // Calcular duración de la carga y escribir en connector_state_changes
          const freedConnector = conectores.find(c => c.id === freedConnectorId);
          if (freedConnector) {
            const chargeEndTime = new Date().toISOString();
            const chargeStartTime = freedConnector.status_changed_at || chargeEndTime;

            // Escribir en connector_state_changes con los campos correctos de la tabla
            const now = new Date(chargeEndTime);
            const fecha = now.toISOString().split('T')[0]; // YYYY-MM-DD
            const hora = now.toTimeString().split(' ')[0]; // HH:MM:SS
            const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
            const dia = diasSemana[now.getDay()];
            const durationSeconds = Math.floor(
              (new Date(chargeEndTime) - new Date(chargeStartTime)) / 1000
            );

            // [LOG 4] Antes de INSERT en connector_state_changes
            console.log('[v0-DIAG-WATCHER] Insertando en connector_state_changes:', {
              connector_id: freedConnectorId,
              estado_anterior: freedPrevStatus,
              estado_nuevo: freedCurrStatus,
              fecha: fecha,
              timestamp: chargeEndTime
            });

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
              console.error('[v0-DIAG-WATCHER] ❌ ERROR INSERT connector_state_changes:', stateChangeError.message);
              console.error('[v0-DIAG-WATCHER]    Detalles:', JSON.stringify(stateChangeError, null, 2));
            } else {
              console.log('[v0-DIAG-WATCHER] ✓ INSERT connector_state_changes exitoso');
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
                max_attempts: 1,
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
          // [LOG 5] Actualizando last_connector_states
          console.log('[v0-DIAG-WATCHER] Actualizando last_connector_states:', {
            watcher_id: watcher.id,
            station_id: watcher.station_id,
            currentStates: currentStates
          });

          const { error: updateError } = await supabase
            .from('active_watchers')
            .update({ last_connector_states: currentStates })
            .eq('id', watcher.id);

          if (updateError) {
            console.error('[v0-DIAG-WATCHER] ❌ ERROR UPDATE last_connector_states:', updateError.message);
            console.error('[v0-DIAG-WATCHER]    Detalles:', JSON.stringify(updateError, null, 2));
          } else {
            console.log('[v0-DIAG-WATCHER] ✓ UPDATE last_connector_states exitoso');
          }
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
