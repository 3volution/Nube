/**
 * Servicio de notificaciones - Twilio Voice
 * 
 * sendCallAlert(): lanza una llamada con timeout=14s y statusCallback.
 * La llamada actúa únicamente como alarma acústica.
 * La confirmación real ocurre desde la interfaz web.
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://merida.hackerdepueblo.es';

/**
 * Lanza una llamada Twilio de alerta.
 * @param {Object} params
 * @param {string} params.phoneNumber - Número destino
 * @param {string} params.stationName - Nombre de la estación liberada
 * @param {number} params.attempt - Número de intento actual (1-5)
 * @returns {{ success: boolean, callSid?: string, error?: string }}
 */
export async function sendCallAlert({ phoneNumber, stationName, attempt = 1 }) {
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
  <Say voice="alice" language="es-ES">Alerta. Cargador disponible en ${stationName}. Intento ${attempt} de 2. Confirma en la aplicacion.</Say>
</Response>`;

    const result = await client.calls.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
      twiml: twiml,
      timeout: 14,
      statusCallback: `${BASE_URL}/api/twilio/call-status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['completed'],
    });

    return { success: true, callSid: result.sid };
  } catch (error) {
    console.error('notification-service - error Twilio:', error.message);
    return { success: false, error: error.message };
  }
}

// Mantener compatibilidad con llamadas previas a sendNotification
export async function sendNotification(phoneNumber, stationName) {
  return sendCallAlert({ phoneNumber, stationName, attempt: 1 });
}
