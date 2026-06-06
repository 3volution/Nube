/**
 * Servicio de notificaciones - Twilio Voice
 */

async function sendTwilioCall(phoneNumber, stationName) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.error('notification-service - Twilio no configurado');
      return { success: false, error: 'Twilio not configured' };
    }

    if (!phoneNumber) {
      console.error('notification-service - phoneNumber vacío');
      return { success: false, error: 'Phone number is empty' };
    }

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

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

    return { success: true, method: 'twilio', callId: result.sid };
  } catch (error) {
    console.error('notification-service - error Twilio:', error.message);
    return { success: false, method: 'twilio', error: error.message };
  }
}

export async function sendNotification(phoneNumber, stationName) {
  try {
    return await sendTwilioCall(phoneNumber, stationName);
  } catch (error) {
    console.error('notification-service - error en sendNotification:', error.message);
    return { success: false, error: error.message };
  }
}

export { sendTwilioCall };
