import { createClient } from '@supabase/supabase-js';
import { sendNotification } from '@/app/services/notification-service';

// Helper function para crear cliente Supabase
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }
  
  return createClient(url, key);
}

/**
 * Cron Job: Ejecutar cada minuto para verificar disponibilidad de cargadores
 * Solo envía llamada por Twilio cuando encuentra cargador disponible
 */
export async function POST(request) {
  // Verificar token de seguridad
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseClient();
    console.log('[v0] Verificación de cargadores - iniciada');

    // Obtener todos los monitoreos activos
    const { data: activeMonitorings, error: fetchError } = await supabase
      .from('charger_monitoring')
      .select('*')
      .eq('is_active', true);

    if (fetchError) {
      console.error('[v0] Error obteniendo monitoreos:', fetchError);
      return Response.json({ error: fetchError.message }, { status: 500 });
    }

    if (!activeMonitorings || activeMonitorings.length === 0) {
      console.log('[v0] No hay monitoreos activos');
      return Response.json({ success: true, checked: 0, notificationsSent: 0 }, { status: 200 });
    }

    console.log(`[v0] Verificando ${activeMonitorings.length} estaciones monitoreadas`);
    let notificationsCount = 0;

    // Verificar cada monitoreo activo
    for (const monitoring of activeMonitorings) {
      try {
        // Obtener estado actual de los cargadores de esta estación
        const stationsResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/stations`);
        const stationsData = await stationsResponse.json();

        // Buscar la estación monitoreada
        const station = stationsData.find(s => s.id === monitoring.station_id);
        
        if (!station) {
          console.log(`[v0] Estación no encontrada: ${monitoring.station_id}`);
          continue;
        }

        // Verificar si hay cargadores libres
        const freeChargers = station.connectors.filter(c => c.status === 'FREE' || c.status === 'AVAILABLE');

        if (freeChargers.length > 0) {
          console.log(`[v0] Cargador DISPONIBLE en ${monitoring.station_name}! Enviando llamada...`);
          
          // Enviar notificación por Twilio
          const notificationResult = await sendNotification(
            monitoring.phone_number,
            monitoring.station_name
          );

          if (notificationResult.success) {
            console.log(`[v0] Llamada Twilio enviada exitosamente`);
            notificationsCount++;

            // Registrar que se encontró disponibilidad (pero NO detener el monitoreo)
            // El usuario debe desactivarlo manualmente
            await supabase
              .from('charger_monitoring')
              .update({
                found_available: true,
                found_at: new Date().toISOString()
              })
              .eq('id', monitoring.id);
          } else {
            console.error(`[v0] Error enviando llamada Twilio:`, notificationResult.error);
          }
        }
      } catch (error) {
        console.error(`[v0] Error verificando estación ${monitoring.station_id}:`, error.message);
      }
    }

    console.log(`[v0] Verificación completada. Llamadas enviadas: ${notificationsCount}`);
    return Response.json({ 
      success: true, 
      checked: activeMonitorings.length,
      notificationsSent: notificationsCount 
    }, { status: 200 });

  } catch (error) {
    console.error('[v0] Error en cron job:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
