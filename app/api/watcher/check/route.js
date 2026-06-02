import { createClient } from '@supabase/supabase-js';
import { obtenerDatosEstacion } from '@/api/electromaps';
import { sendNotification } from '@/app/services/notification-service';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }
  
  return createClient(url, key);
}

/**
 * GET /api/watcher/check - Invocado por cron externo (cron-job.org) cada minuto
 * Query: ?secret=CRON_SECRET (para autenticación)
 * 
 * Lógica:
 * 1. Si no hay vigilancias activas -> retorna sin consultar Electromaps
 * 2. Para cada vigilancia activa -> consulta Electromaps
 * 3. Compara estado actual vs last_connector_states
 * 4. Si algún conector pasó de OCCUPIED -> FREE -> llama Twilio
 * 5. Actualiza last_connector_states para la próxima iteración
 */
export async function GET(request) {
  try {
    // Verificar autenticación con secret
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    if (secret !== process.env.CRON_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    console.log('[v0] Watcher check - iniciado');

    // Obtener vigilancias activas
    const { data: watchers, error: fetchError } = await supabase
      .from('active_watchers')
      .select('*')
      .eq('status', 'active');

    if (fetchError) {
      console.error('[v0] Error obteniendo vigilancias:', fetchError);
      return Response.json({ error: fetchError.message }, { status: 500 });
    }

    // Si no hay vigilancias activas, no hacer nada
    if (!watchers || watchers.length === 0) {
      console.log('[v0] No hay vigilancias activas - sin consultas a Electromaps');
      return Response.json({ success: true, checked: 0, calls_made: 0 }, { status: 200 });
    }

    console.log(`[v0] Procesando ${watchers.length} vigilancia(s) activa(s)`);

    const user = process.env.ELECTROMAPS_USER;
    const pass = process.env.ELECTROMAPS_PASS;
    
    if (!user || !pass) {
      return Response.json({ error: 'Credenciales de Electromaps no configuradas' }, { status: 500 });
    }

    let callsMade = 0;

    for (const watcher of watchers) {
      try {
        // Consultar estado actual de los conectores
        const conectores = await obtenerDatosEstacion(watcher.station_id, user, pass);
        
        if (!conectores || conectores.length === 0) {
          console.log(`[v0] No se obtuvieron conectores para estación ${watcher.station_id}`);
          continue;
        }

        // Crear mapa de estado actual
        const currentStates = {};
        conectores.forEach(c => {
          currentStates[c.id] = c.status;
        });

        // Comparar con estado anterior para detectar transiciones OCCUPIED -> FREE
        const previousStates = watcher.last_connector_states || {};
        let freedConnectorFound = false;
        let freedConnectorId = null;

        for (const connectorId of Object.keys(currentStates)) {
          const previousStatus = previousStates[connectorId];
          const currentStatus = currentStates[connectorId];

          // Detectar transición OCCUPIED -> FREE
          if (previousStatus === 'OCCUPIED' && currentStatus === 'FREE') {
            console.log(`[v0] Conector ${connectorId} liberado en estación ${watcher.station_name}`);
            freedConnectorFound = true;
            freedConnectorId = connectorId;
            break; // Con encontrar uno es suficiente
          }
        }

        if (freedConnectorFound) {
          // Llamar a Twilio
          console.log(`[v0] Iniciando llamada Twilio para estación ${watcher.station_name}`);
          
          const message = `Hola Nacho. Un cargador ha quedado libre en ${watcher.station_name}. Repito: hay un cargador disponible en ${watcher.station_name}.`;
          
          const MAX_RETRIES = 5;

          try {
            await sendNotification(process.env.TWILIO_CALL_RECIPIENT, watcher.station_name);
            callsMade++;

            // Llamada exitosa: marcar vigilancia como completada
            await supabase
              .from('active_watchers')
              .update({ status: 'completed' })
              .eq('id', watcher.id);

            console.log(`[v0] Vigilancia completada para estación ${watcher.station_name}`);
          } catch (twilioError) {
            console.error(`[v0] Error en llamada Twilio (intento ${watcher.retry_count + 1}/${MAX_RETRIES}):`, twilioError.message);

            const newRetryCount = (watcher.retry_count || 0) + 1;

            if (newRetryCount >= MAX_RETRIES) {
              // Reintentos agotados: marcar como failed
              await supabase
                .from('active_watchers')
                .update({ status: 'failed', retry_count: newRetryCount })
                .eq('id', watcher.id);

              console.log(`[v0] Vigilancia marcada como failed tras ${MAX_RETRIES} intentos - estación ${watcher.station_name}`);
            } else {
              // Incrementar retry_count y dejar status activo para reintentar el próximo minuto
              // NO actualizamos last_connector_states para que la transición OCCUPIED->FREE persista
              await supabase
                .from('active_watchers')
                .update({ retry_count: newRetryCount })
                .eq('id', watcher.id);

              console.log(`[v0] Reintento ${newRetryCount}/${MAX_RETRIES} programado para próximo ciclo`);
            }
          }
        } else {
          // Actualizar last_connector_states para la próxima iteración
          await supabase
            .from('active_watchers')
            .update({ last_connector_states: currentStates })
            .eq('id', watcher.id);
        }

      } catch (stationError) {
        console.error(`[v0] Error procesando estación ${watcher.station_id}:`, stationError);
        // Continuar con las demás vigilancias
      }
    }

    console.log(`[v0] Watcher check completado - ${watchers.length} vigilancias, ${callsMade} llamadas`);
    return Response.json({ 
      success: true, 
      checked: watchers.length, 
      calls_made: callsMade 
    }, { status: 200 });

  } catch (error) {
    console.error('[v0] Error en GET /api/watcher/check:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
