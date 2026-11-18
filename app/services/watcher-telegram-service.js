/**
 * HackerCharger -> Telegram Toyota CHR.
 * Env: HACKERCHARGER_TELEGRAM_BOT_TOKEN (opcional; fallback TELEGRAM_BOT_TOKEN),
 *      HACKERCHARGER_TELEGRAM_CHAT_ID (opcional; fallback TELEGRAM_CHAT_ID).
 * Verifica getMe antes de enviar para evitar que las alertas lleguen al bot equivocado.
 */
export const ALERT_COUNT = 5;
export const ALERT_INTERVAL_MS = 1000;

export function waitBetweenAlerts(ms = ALERT_INTERVAL_MS) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getToyotaChrTelegram() {
  const token = process.env.HACKERCHARGER_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.HACKERCHARGER_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error('Faltan credenciales Telegram Toyota CHR en el servidor');
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error('Telegram getMe no ha validado las credenciales');
  }
  const expected = (process.env.HACKERCHARGER_TELEGRAM_USERNAME || 'RiderCHRbot').replace(/^@/, '').toLowerCase();
  if (String(data.result?.username || '').toLowerCase() !== expected) {
    throw new Error('El token Telegram no corresponde a @' + expected + '; envio bloqueado');
  }
  return { token, chatId };
}

export async function sendToyotaChrAlert(telegram, { stationName, connectorId, sequenceNumber }) {
  const text = [
    `⚡ HACKERCHARGER · CARGADOR LIBRE (${sequenceNumber}/${ALERT_COUNT})`,
    `📍 ${stationName}`,
    `🔌 Conector: ${connectorId}`,
    sequenceNumber === ALERT_COUNT
      ? '✅ Último aviso. La vigilancia se desactiva.'
      : '🔔 Alerta de disponibilidad.'
  ].join('\n');

  const response = await fetch(`https://api.telegram.org/bot${telegram.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegram.chatId,
      text,
      disable_web_page_preview: true,
    }),
    cache: 'no-store',
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram rechazó el aviso ${sequenceNumber}/${ALERT_COUNT} (HTTP ${response.status})`);
  }
  return payload.result?.message_id;
}
