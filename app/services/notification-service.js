/**
 * Servicio de notificaciones simplificado - Solo Twilio
 */

// Llamada Twilio Voice
async function sendTwilioCall(phoneNumber, stationName) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.error('[v0] Twilio no configurado - credenciales faltantes');
      return { success: false, error: 'Twilio not configured' };
    }

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    // TwiML para la llamada
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="alice">Se ha encontrado un cargador disponible en ${stationName}. 
        Debes desactivar el monitoreo cuando hayas cargado tu vehículo.</Say>
      </Response>`;

    const result = await client.calls.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
      twiml: twiml
    });

    console.log('[v0] Llamada Twilio iniciada:', result.sid);
    return { success: true, method: 'twilio', callId: result.sid };
  } catch (error) {
    console.error('[v0] Error en llamada Twilio:', error.message);
    return { success: false, method: 'twilio', error: error.message };
  }
}

/**
 * Enviar notificación por Twilio
 */
export async function sendNotification(phoneNumber, stationName) {
  try {
    const result = await sendTwilioCall(phoneNumber, stationName);
    return result;
  } catch (error) {
    console.error('[v0] Error en sendNotification:', error.message);
    return { success: false, error: error.message };
  }
}

export { sendTwilioCall };
