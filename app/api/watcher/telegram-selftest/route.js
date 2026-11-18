import {
  ALERT_COUNT,
  ALERT_INTERVAL_MS,
  getToyotaChrTelegram,
  sendToyotaChrAlert,
  waitBetweenAlerts,
} from '@/app/services/watcher-telegram-service';

export const maxDuration = 30;

// Prueba técnica temporal, protegida por el secreto del programador.
// NUNCA inserta una vigilancia ni simula una transición real de Electromaps.
export async function POST(request) {
  const secret = process.env.HACKERCHARGER_WATCHER_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let telegram;
  try {
    telegram = await getToyotaChrTelegram();
  } catch (e) {
    return Response.json({ ok: false, sent: 0, reason: e.message }, { status: 503 });
  }

  const records = [];
  try {
    for (let i = 1; i <= ALERT_COUNT; i++) {
      if (i > 1) await waitBetweenAlerts(ALERT_INTERVAL_MS);
      await sendToyotaChrAlert(telegram, {
        stationName: '🧪 PRUEBA CONTROLADA: NO ES UNA LIBERACIÓN REAL',
        connectorId: 'TEST-ONLY',
        sequenceNumber: i,
      });
      records.push({ sequence: i, accepted_at: new Date().toISOString() });
    }
    return Response.json({ ok: true, simulated: true, count: records.length, records });
  } catch (error) {
    console.error('Telegram selftest failed', error.message);
    return Response.json({
      ok: false, simulated: true, count: records.length,
      records, reason: String(error.message).slice(0, 200)
    }, { status: 502 });
  }
}
