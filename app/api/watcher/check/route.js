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
 * GET /api/watcher/check - Invocado por cron externo cada minuto
 * Query: ?secret=CRON_SECRET
 * 
 * Logica:
 * 1. Si no hay vigilancias activas -> retorna sin consultar Electromaps
 * 2. Para cada vigilancia activa -> consulta Electromaps
 * 3. Compara estado actual vs last_connector_states
 * 4. Si algun conector paso de OCCUPIED -> FREE -> llama Twilio
 * 5. Actualiza last_connector_states para la proxima iteracion
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    if (secret !== process.env.CRON_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    const { data: watchers, error: fetchError } = await supabase
      .from('active_watchers')
      .select('*')
      .eq('status', 'active');

    if (fetchError) {
      console.error('Watcher check - error BD:', fetchError.message);
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
    const MAX_RETRIES = 5;

    for (const watcher of watchers) {
      try {
        const conectores = await obtenerDatosEstacion(watcher.station_id, user, pass);
        
        if (!conectores || conectores.length === 0) {
          continue;
        }

        const currentStates = {};
        conectores.forEach(c => {
          currentStates[c.id] = c.status;
        });

        const previousStates = watcher.last_connector_states || {};
        let freedConnectorFound = false;

        for (const connectorId of Object.keys(currentStates)) {
          const previousStatus = previousStates[connectorId];
          const currentStatus = currentStates[connectorId];

          if (previousStatus === 'OCCUPIED' && currentStatus === 'FREE') {
            console.log(`Conector ${connectorId} liberado en ${watcher.station_name}`);
            freedConnectorFound = true;
            break;
          }
        }

        if (freedConnectorFound) {
          try {
            await sendNotification(process.env.TWILIO_CALL_RECIPIENT, watcher.station_name);
            callsMade++;

            await supabase
              .from('active_watchers')
              .update({ status: 'completed' })
              .eq('id', watcher.id);

          } catch (twilioError) {
            console.error(`Error Twilio (intento ${watcher.retry_count + 1}/${MAX_RETRIES}):`, twilioError.message);

            const newRetryCount = (watcher.retry_count || 0) + 1;

            if (newRetryCount >= MAX_RETRIES) {
              await supabase
                .from('active_watchers')
                .update({ status: 'failed', retry_count: newRetryCount })
                .eq('id', watcher.id);
            } else {
              await supabase
                .from('active_watchers')
                .update({ retry_count: newRetryCount })
                .eq('id', watcher.id);
            }
          }
        } else {
          await supabase
            .from('active_watchers')
            .update({ last_connector_states: currentStates })
            .eq('id', watcher.id);
        }

      } catch (stationError) {
        console.error(`Error procesando estacion ${watcher.station_id}:`, stationError.message);
      }
    }

    return Response.json({ 
      success: true, 
      checked: watchers.length, 
      calls_made: callsMade 
    }, { status: 200 });

  } catch (error) {
    console.error('Error en watcher/check:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
