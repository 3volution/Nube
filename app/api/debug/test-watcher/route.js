import { createClient } from '@supabase/supabase-js';
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
 * GET /api/debug/test-watcher?secret=CRON_SECRET
 * 
 * Endpoint de DEBUG TEMPORAL para simular exactamente lo que hace watcher/check
 * cuando detecta un conector liberado.
 * 
 * Propósito: Diagnosticar por qué Twilio no está funcionando
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    if (secret !== process.env.CRON_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[v0] === DEBUG TEST-WATCHER INICIADO ===');

    const supabase = getSupabaseClient();

    // Leer la PRIMERA vigilancia activa
    const { data: watchers, error: fetchError } = await supabase
      .from('active_watchers')
      .select('*')
      .eq('status', 'active')
      .limit(1);

    if (fetchError) {
      console.error('[v0] Error fetching watchers:', fetchError);
      return Response.json({ error: fetchError.message }, { status: 500 });
    }

    if (!watchers || watchers.length === 0) {
      console.log('[v0] No hay vigilancias activas para testear');
      return Response.json({ 
        success: false,
        message: 'No active watchers found',
        watchers: []
      }, { status: 200 });
    }

    const watcher = watchers[0];
    console.log('[v0] Vigilancia seleccionada:', watcher.station_name, '(ID:', watcher.station_id, ')');
    console.log('[v0] Phone number en DB:', watcher.phone_number);
    console.log('[v0] Phone number desde ENV:', process.env.TWILIO_CALL_RECIPIENT);

    // FORZAR que freedConnectorFound = true (simular detección de conector liberado)
    const phoneNumberToUse = watcher.phone_number || process.env.TWILIO_CALL_RECIPIENT;

    console.log('[v0] === SIMULANDO DETECCIÓN DE CONECTOR LIBERADO ===');
    console.log('[v0] Llamando sendNotification con:');
    console.log('[v0]   phoneNumber:', phoneNumberToUse);
    console.log('[v0]   stationName:', watcher.station_name);

    let notificationResult;
    try {
      notificationResult = await sendNotification(phoneNumberToUse, watcher.station_name);
      console.log('[v0] Resultado de sendNotification:', JSON.stringify(notificationResult));
    } catch (twilioError) {
      console.error('[v0] EXCEPCIÓN en sendNotification:', twilioError.message);
      console.error('[v0] Stack trace:', twilioError.stack);
      notificationResult = {
        success: false,
        error: twilioError.message,
        stack: twilioError.stack
      };
    }

    console.log('[v0] === DEBUG TEST-WATCHER FINALIZADO ===');

    return Response.json({
      success: true,
      message: 'Test execution completed',
      watcher: {
        id: watcher.id,
        station_name: watcher.station_name,
        station_id: watcher.station_id,
        phone_number: watcher.phone_number
      },
      environment: {
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'CONFIGURED' : 'MISSING',
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'CONFIGURED' : 'MISSING',
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || 'MISSING',
        TWILIO_CALL_RECIPIENT: process.env.TWILIO_CALL_RECIPIENT || 'EMPTY'
      },
      phoneNumberUsed: phoneNumberToUse,
      notificationResult: notificationResult
    }, { status: 200 });

  } catch (error) {
    console.error('[v0] ERROR en debug/test-watcher:', error.message);
    console.error('[v0] Stack trace:', error.stack);
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
