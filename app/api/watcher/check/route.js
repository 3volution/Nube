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
 * GET /api/watcher/check - Ejecutado cada minuto por Vercel Cron
 * Compatibilidad con cron-job.org: ?secret=CRON_SECRET
 * Compatibilidad con Vercel Cron: header x-vercel-cron
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
    // Validacion: Aceptar desde Vercel Cron (header) o desde cron-job.org (query param)
    const verelCronHeader = request.headers.get('x-vercel-cron');
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    const isFromVercelCron = verelCronHeader === 'true';
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

    console.log(`[v0] watcher/check iniciado - ${watchers.length} vigilancias a evaluar`);

    for (const watcher of watchers) {
      try {
        console.log(`[v0] === VIGILANCIA ${watcher.station_name} (${watcher.station_id}) ===`);
        
        const conectores = await obtenerDatosEstacion(watcher.station_id, user, pass);
        console.log(`[v0] Electromaps retornó ${conectores?.length || 0} conectores`);
        
        if (!conectores || conectores.length === 0) {
          console.log(`[v0] Sin conectores - continuando`);
          continue;
        }

        const currentStates = {};
        conectores.forEach(c => {
          currentStates[c.id] = c.status;
        });
        console.log(`[v0] Estados actuales:`, JSON.stringify(currentStates));

        const previousStates = watcher.last_connector_states || {};
        console.log(`[v0] Estados previos:`, JSON.stringify(previousStates));
        
        let freedConnectorFound = false;

        for (const connectorId of Object.keys(currentStates)) {
          const previousStatus = previousStates[connectorId];
          const currentStatus = currentStates[connectorId];

          console.log(`[v0] Conector ${connectorId}: ${previousStatus || 'N/A'} → ${currentStatus}`);

          if (previousStatus === 'OCCUPIED' && currentStatus === 'FREE') {
            console.log(`[v0] ✅ CONECTOR LIBERADO: ${connectorId}`);
            freedConnectorFound = true;
            break;
          }
        }

        console.log(`[v0] freedConnectorFound = ${freedConnectorFound}`);

        if (freedConnectorFound) {
          console.log(`[v0] Ejecutando sendNotification con phoneNumber: ${process.env.TWILIO_CALL_RECIPIENT}`);
          
          try {
            const notifResult = await sendNotification(process.env.TWILIO_CALL_RECIPIENT, watcher.station_name);
            console.log(`[v0] Resultado de sendNotification:`, JSON.stringify(notifResult));
            
            if (notifResult.success) {
              callsMade++;
              console.log(`[v0] Llamada exitosa - total callsMade: ${callsMade}`);
            } else {
              console.log(`[v0] Llamada falló:`, notifResult.error);
            }

            await supabase
              .from('active_watchers')
              .update({ status: 'completed' })
              .eq('id', watcher.id);
            console.log(`[v0] Status actualizado a 'completed' en DB`);

          } catch (twilioError) {
            console.error(`[v0] EXCEPCIÓN en Twilio (intento ${watcher.retry_count + 1}/${MAX_RETRIES}):`, twilioError.message);
            console.error(`[v0] Stack trace:`, twilioError.stack);

            const newRetryCount = (watcher.retry_count || 0) + 1;

            if (newRetryCount >= MAX_RETRIES) {
              console.log(`[v0] Máximo de reintentos alcanzado - marcando como 'failed'`);
              await supabase
                .from('active_watchers')
                .update({ status: 'failed', retry_count: newRetryCount })
                .eq('id', watcher.id);
            } else {
              console.log(`[v0] Incrementando retry_count a ${newRetryCount}`);
              await supabase
                .from('active_watchers')
                .update({ retry_count: newRetryCount })
                .eq('id', watcher.id);
            }
          }
        } else {
          console.log(`[v0] Sin conectores liberados - actualizando last_connector_states`);
          await supabase
            .from('active_watchers')
            .update({ last_connector_states: currentStates })
            .eq('id', watcher.id);
        }

      } catch (stationError) {
        console.error(`[v0] EXCEPCIÓN procesando estación ${watcher.station_id}:`, stationError.message);
        console.error(`[v0] Stack trace:`, stationError.stack);
      }
    }

    console.log(`[v0] watcher/check finalizado - Total llamadas hechas: ${callsMade}`);
    
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
