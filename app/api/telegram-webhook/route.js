// Endpoint para recibir comandos de Telegram y controlar cargadores ficticios
// Comandos disponibles:
// /ocupar 003657 - Cambia el cargador a OCUPADO
// /liberar 003657 - Cambia el cargador a LIBRE
// /estado - Ver estado actual de cargadores ficticios

export async function POST(request) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  // Cargadores ficticios permitidos
  const CARGADORES_FICTICIOS = ['003657', '003658'];

  try {
    const body = await request.json();
    const message = body.message;

    if (!message || !message.text) {
      return Response.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Verificar que el mensaje viene del chat autorizado
    if (String(chatId) !== String(TELEGRAM_CHAT_ID)) {
      console.log(`[v0] Mensaje de chat no autorizado: ${chatId}`);
      return Response.json({ ok: true });
    }

    // Funcion para enviar mensaje de respuesta
    async function enviarRespuesta(texto) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: texto,
          parse_mode: 'HTML'
        })
      });
    }

    // Procesar comandos
    if (text.startsWith('/ocupar')) {
      const partes = text.split(' ');
      const connectorId = partes[1];

      if (!connectorId || !CARGADORES_FICTICIOS.includes(connectorId)) {
        await enviarRespuesta(`Uso: /ocupar [ID]\nIDs validos: ${CARGADORES_FICTICIOS.join(', ')}`);
        return Response.json({ ok: true });
      }

      // Guardar estado en Supabase
      await fetch(`${SUPABASE_URL}/rest/v1/test_connectors?connector_id=eq.${connectorId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY
        }
      });

      // Obtener estado anterior
      const prevRes = await fetch(`${SUPABASE_URL}/rest/v1/test_connectors?connector_id=eq.${connectorId}`, {
        headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY }
      });
      const prevData = await prevRes.json();
      const estadoAnterior = prevData.length > 0 ? prevData[0].status : 'FREE';

      await fetch(`${SUPABASE_URL}/rest/v1/test_connectors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({
          connector_id: connectorId,
          status: 'OCCUPIED',
          status_updated_at: new Date().toISOString()
        })
      });

      // Registrar cambio de estado en connector_state_changes
      const ahora = new Date();
      await fetch(`${SUPABASE_URL}/rest/v1/connector_state_changes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({
          timestamp: ahora.toISOString(),
          fecha: ahora.toISOString().split('T')[0],
          dia: ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'][ahora.getDay()],
          hora: ahora.toTimeString().slice(0, 8),
          connector_id: connectorId,
          station_id: 'TEST',
          station_name: 'Cargador Ficticio',
          estado_anterior: estadoAnterior,
          estado_nuevo: 'OCCUPIED',
          tiempo_en_estado_anterior_segundos: 0
        })
      });

      await enviarRespuesta(`Cargador ${connectorId} ahora esta OCUPADO (registrado en historial)`);

    } else if (text.startsWith('/liberar')) {
      const partes = text.split(' ');
      const connectorId = partes[1];

      if (!connectorId || !CARGADORES_FICTICIOS.includes(connectorId)) {
        await enviarRespuesta(`Uso: /liberar [ID]\nIDs validos: ${CARGADORES_FICTICIOS.join(', ')}`);
        return Response.json({ ok: true });
      }

      // Obtener estado anterior
      const prevResLib = await fetch(`${SUPABASE_URL}/rest/v1/test_connectors?connector_id=eq.${connectorId}`, {
        headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY }
      });
      const prevDataLib = await prevResLib.json();
      const estadoAnteriorLib = prevDataLib.length > 0 ? prevDataLib[0].status : 'OCCUPIED';

      // Guardar estado en Supabase
      await fetch(`${SUPABASE_URL}/rest/v1/test_connectors?connector_id=eq.${connectorId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY
        }
      });

      await fetch(`${SUPABASE_URL}/rest/v1/test_connectors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({
          connector_id: connectorId,
          status: 'FREE',
          status_updated_at: new Date().toISOString()
        })
      });

      // Registrar cambio de estado en connector_state_changes
      const ahoraLib = new Date();
      await fetch(`${SUPABASE_URL}/rest/v1/connector_state_changes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({
          timestamp: ahoraLib.toISOString(),
          fecha: ahoraLib.toISOString().split('T')[0],
          dia: ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'][ahoraLib.getDay()],
          hora: ahoraLib.toTimeString().slice(0, 8),
          connector_id: connectorId,
          station_id: 'TEST',
          station_name: 'Cargador Ficticio',
          estado_anterior: estadoAnteriorLib,
          estado_nuevo: 'FREE',
          tiempo_en_estado_anterior_segundos: 0
        })
      });

      await enviarRespuesta(`Cargador ${connectorId} ahora esta LIBRE (registrado en historial)`);

    } else if (text === '/estado') {
      // Obtener estado actual de cargadores ficticios
      const res = await fetch(`${SUPABASE_URL}/rest/v1/test_connectors`, {
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY
        }
      });
      const data = await res.json();

      let mensaje = '<b>Estado cargadores ficticios:</b>\n\n';
      CARGADORES_FICTICIOS.forEach(id => {
        const found = data.find(c => c.connector_id === id);
        const status = found ? found.status : 'SIN DATOS';
        const emoji = status === 'OCCUPIED' ? '🔴' : status === 'FREE' ? '🟢' : '⚪';
        mensaje += `${emoji} ${id}: ${status}\n`;
      });

      await enviarRespuesta(mensaje);

    } else if (text === '/ayuda' || text === '/help' || text === '/start') {
      await enviarRespuesta(
        '<b>Comandos disponibles:</b>\n\n' +
        '/ocupar [ID] - Marca cargador como OCUPADO\n' +
        '/liberar [ID] - Marca cargador como LIBRE\n' +
        '/estado - Ver estado actual\n\n' +
        `<b>IDs validos:</b> ${CARGADORES_FICTICIOS.join(', ')}`
      );
    }

    return Response.json({ ok: true });

  } catch (error) {
    console.error('[v0] Error en webhook Telegram:', error);
    return Response.json({ ok: true });
  }
}

// GET para verificar que el endpoint funciona
export async function GET() {
  return Response.json({ 
    status: 'ok', 
    message: 'Telegram webhook endpoint activo',
    comandos: ['/ocupar [ID]', '/liberar [ID]', '/estado', '/ayuda']
  });
}
