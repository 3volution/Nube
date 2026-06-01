import TelegramBot from 'node-telegram-bot-api';

const telegramBot = process.env.TELEGRAM_BOT_TOKEN ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN) : null;

/**
 * Servicio de notificaciones con cascada: Telegram → SMS → Twilio Voice
 */

// Simulación de SMS (usar Twilio SMS o servicio similar)
async function sendSMS(phoneNumber, message) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.log('[v0] SMS deshabilitado - credenciales no configuradas');
      return { success: false, error: 'SMS not configured' };
    }

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    console.log('[v0] SMS enviado exitosamente:', result.sid);
    return { success: true, method: 'sms', messageId: result.sid };
  } catch (error) {
    console.error('[v0] Error enviando SMS:', error.message);
    return { success: false, method: 'sms', error: error.message };
  }
}

// Enviar Telegram - 10 mensajes masivos
async function sendTelegram(chatId, message) {
  try {
    if (!telegramBot || !chatId) {
      console.log('[v0] Telegram deshabilitado o sin chatId');
      return { success: false, error: 'Telegram not configured' };
    }

    // Enviar 10 mensajes con delay de 5 segundos entre cada uno
    const messages = [];
    for (let i = 0; i < 10; i++) {
      await telegramBot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      messages.push(`mensaje ${i + 1}`);
      
      // Esperar 5 segundos antes del siguiente mensaje
      if (i < 9) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.log('[v0] Telegram: 10 mensajes enviados exitosamente');
    return { success: true, method: 'telegram', messagesCount: 10 };
  } catch (error) {
    console.error('[v0] Error enviando Telegram:', error.message);
    return { success: false, method: 'telegram', error: error.message };
  }
}

// Llamada Twilio Voice
async function sendTwilioCall(phoneNumber, stationName, timeRemaining) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.log('[v0] Twilio deshabilitado - credenciales no configuradas');
      return { success: false, error: 'Twilio not configured' };
    }

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    // TwiML para la llamada
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="alice">Se ha encontrado un cargador disponible en ${stationName}. 
        Tienes ${timeRemaining} minutos para llegar. Repito, cargador disponible en ${stationName}.</Say>
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
 * Ejecutar cascada de notificaciones
 * Intenta cada método en orden hasta que uno tenga éxito
 */
export async function sendNotificationCascade(monitoringData, stationName, timeRemaining) {
  const {
    notification_methods,
    telegram_chat_id,
    phone_number,
    duration_minutes
  } = monitoringData;

  const message = `🚗 DISPONIBLE EN ${stationName.toUpperCase()}\n\nSe ha encontrado un cargador libre. Tienes ${timeRemaining} minutos para llegar.`;
  const results = [];

  // Definir orden de cascada basado en notification_methods
  const methods = notification_methods || ['telegram', 'sms', 'twilio'];

  for (const method of methods) {
    try {
      let result;

      if (method === 'telegram' && telegram_chat_id) {
        result = await sendTelegram(telegram_chat_id, message);
      } else if (method === 'sms' && phone_number) {
        result = await sendSMS(phone_number, message);
      } else if (method === 'twilio' && phone_number) {
        result = await sendTwilioCall(phone_number, stationName, timeRemaining);
      } else {
        continue;
      }

      results.push(result);

      // Si tiene éxito, terminar cascada
      if (result.success) {
        console.log(`[v0] Cascada completada: ${method} exitoso`);
        return { success: true, method: method, results: results };
      }
    } catch (error) {
      console.error(`[v0] Error en método ${method}:`, error.message);
      results.push({ success: false, method: method, error: error.message });
    }
  }

  // Si llegamos aquí, todos los métodos fallaron
  console.error('[v0] Cascada completada: todos los métodos fallaron');
  return { success: false, results: results };
}

export { sendTelegram, sendSMS, sendTwilioCall };
