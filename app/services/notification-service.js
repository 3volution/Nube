/**
 * Servicio de notificaciones simplificado - Solo Twilio
 */

// Llamada Twilio Voice
async function sendTwilioCall(phoneNumber, stationName) {
  try {
    console.log('[v0] sendTwilioCall - Intentando llamada');
    console.log('[v0] phoneNumber recibido:', phoneNumber);
    console.log('[v0] stationName:', stationName);
    console.log('[v0] TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? 'CONFIGURADO' : 'VACÍO');
    console.log('[v0] TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? 'CONFIGURADO' : 'VACÍO');
    console.log('[v0] TWILIO_PHONE_NUMBER:', process.env.TWILIO_PHONE_NUMBER);
    console.log('[v0] TWILIO_CALL_RECIPIENT:', process.env.TWILIO_CALL_RECIPIENT);

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.error('[v0] Twilio no configurado - credenciales faltantes');
      return { success: false, error: 'Twilio not configured' };
    }

    if (!phoneNumber) {
      console.error('[v0] phoneNumber está vacío/undefined');
      return { success: false, error: 'Phone number is empty' };
    }

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    // TwiML para la llamada
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="alice">Se ha encontrado un cargador disponible en ${stationName}. 
        Debes desactivar el monitoreo cuando hayas cargado tu vehículo.</Say>
      </Response>`;

    console.log('[v0] Creando llamada Twilio a:', phoneNumber);
    const result = await client.calls.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
      twiml: twiml
    });

    console.log('[v0] Llamada Twilio iniciada exitosamente:', result.sid);
    return { success: true, method: 'twilio', callId: result.sid };
  } catch (error) {
    console.error('[v0] Error en llamada Twilio:', error.message);
    console.error('[v0] Error completo:', error);
    return { success: false, method: 'twilio', error: error.message };
  }
}

/**
 * Enviar notificación por Twilio
 */
export async function sendNotification(phoneNumber, stationName) {
  try {
    console.log('[v0] sendNotification llamado con phoneNumber:', phoneNumber);
    const result = await sendTwilioCall(phoneNumber, stationName);
    console.log('[v0] Resultado de sendNotification:', result);
    return result;
  } catch (error) {
    console.error('[v0] Error en sendNotification:', error.message);
    return { success: false, error: error.message };
  }
}

export { sendTwilioCall };
