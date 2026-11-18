/**
 * Twilio desactivado por decisión del propietario el 18/11/2026.
 * Alertas de vigilancia: app/services/watcher-telegram-service.js.
 * Mantener estos exports evita llamadas accidentales desde rutas legacy.
 */
export async function sendCallAlert() {
  console.warn('Twilio Voice desactivado: use el vigilante Telegram Toyota CHR');
  return { success: false, error: 'TWILIO_DISABLED' };
}

export async function sendNotification() {
  return sendCallAlert();
}
