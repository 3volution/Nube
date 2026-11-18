/**
 * Comprobación de integración de Telegram sin enviar mensajes ni revelar claves.
 * Respuesta publica: solo username del bot y si coincide con la configuración.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const token = process.env.HACKERCHARGER_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.HACKERCHARGER_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  const expected = (process.env.HACKERCHARGER_TELEGRAM_USERNAME || 'RiderCHRbot')
    .replace(/^@/, '').toLowerCase();

  if (!token || !chatId) {
    return Response.json({ configured: false, verified: false }, { status: 503 });
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    const username = body.ok ? body.result?.username || null : null;
    return Response.json({
      configured: true,
      verified: Boolean(username) && username.toLowerCase() === expected,
      bot_username: username,
      expected_username: expected,
    }, { status: username ? 200 : 503 });
  } catch (error) {
    return Response.json({ configured: true, verified: false, error: 'Telegram no responde' }, { status: 503 });
  }
}
