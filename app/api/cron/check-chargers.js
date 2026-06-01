import { createClient } from '@supabase/supabase-js';
import { sendNotificationCascade } from '@/app/services/notification-service';
import { getChargerStatus } from '@/lib/electromaps-client';

// Helper function para crear cliente Supabase
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }
  
  return createClient(url, key);
}

/**
 * Cron Job: Ejecutar cada minuto para verificar disponibilidad de cargadores
 * POST /api/cron/check-chargers
 */
export async function POST(request) {
  // Verificar token de seguridad para evitar acceso no autorizado
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseClient();
    console.log('[v0] Iniciando verificación de cargadores...');

    // Obtener todos los monitoreos activos
    const { data: activeMonitorings, error: fetchError } = await supabase
      .from('charger_monitoring')
      .select('*')
      .eq('is_active', true);

    if (fetchError) {
      console.error('[v0] Error fetching active monitorings:', fetchError);
      return Response.json({ error: fetchError.message }, { status: 500 });
    }

    if (!activeMonitorings || activeMonitorings.length === 0) {
      console.log('[v0] Sin monitoreos activos');
      return Response.json({ message: 'No active monitorings', processed: 0 }, { status: 200 });
    }

    console.log(`[v0] Procesando ${activeMonitorings.length} monitoreos activos`);

    let alertsSent = 0;

    // Procesar cada monitoreo activo
    for (const monitoring of activeMonitorings) {
      try {
        // Verificar si ha expirado
        const endTime = new Date(monitoring.end_time);
        if (new Date() > endTime) {
          console.log(`[v0] Monitoreo ${monitoring.id} expirado`);
          
          await supabase
            .from('charger_monitoring')
            .update({ is_active: false })
            .eq('id', monitoring.id);
          
          continue;
        }

        // Obtener estado actual de conectores de la estación
        const chargers = await getChargerStatus(monitoring.station_id);
        
        if (!chargers || chargers.length === 0) {
          console.log(`[v0] No se encontraron cargadores para estación ${monitoring.station_id}`);
          continue;
        }

        // Buscar si hay algún cargador LIBRE
        const freeCharger = chargers.find(c => c.status === 'FREE' || c.status === 'AVAILABLE');

        if (freeCharger) {
          console.log(`[v0] Cargador disponible encontrado: ${freeCharger.visualRef} en ${monitoring.station_name}`);

          // Calcular tiempo restante
          const timeRemaining = Math.ceil(
            (endTime.getTime() - new Date().getTime()) / (1000 * 60)
          );

          // Ejecutar cascada de notificaciones
          const notificationResult = await sendNotificationCascade(
            monitoring,
            monitoring.station_name,
            timeRemaining
          );

          // Registrar el intento de alerta
          if (notificationResult.success) {
            console.log(`[v0] Alerta enviada exitosamente por ${notificationResult.method}`);
            alertsSent++;

            // Registrar en log de alertas
            await supabase
              .from('monitoring_alerts_log')
              .insert([
                {
                  monitoring_id: monitoring.id,
                  station_id: monitoring.station_id,
                  alert_method: notificationResult.method,
                  alert_status: 'success'
                }
              ]);

            // Marcar monitoreo como completado
            await supabase
              .from('charger_monitoring')
              .update({
                is_active: false,
                found_available: true,
                found_at: new Date().toISOString(),
                alerts_sent: {
                  ...monitoring.alerts_sent,
                  [notificationResult.method]: new Date().toISOString()
                }
              })
              .eq('id', monitoring.id);
          } else {
            console.error(`[v0] Error enviando notificaciones para monitoreo ${monitoring.id}`);
            
            // Registrar intentos fallidos
            for (const result of notificationResult.results) {
              if (!result.success) {
                await supabase
                  .from('monitoring_alerts_log')
                  .insert([
                    {
                      monitoring_id: monitoring.id,
                      station_id: monitoring.station_id,
                      alert_method: result.method,
                      alert_status: 'failed',
                      error_message: result.error
                    }
                  ]);
              }
            }
          }
        }
      } catch (error) {
        console.error(`[v0] Error procesando monitoreo ${monitoring.id}:`, error);
      }
    }

    console.log(`[v0] Verificación completada. Alertas enviadas: ${alertsSent}`);
    return Response.json({ 
      message: 'Check completed',
      processed: activeMonitorings.length,
      alertsSent: alertsSent
    }, { status: 200 });

  } catch (error) {
    console.error('[v0] Error in charger check cron:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
