import { kv } from '@vercel/kv';

export async function GET(req) {
  try {
    // Obtener logs recientes
    const recentLogs = await kv.get('logs:recent') || [];
    
    // Obtener estado de todas las estaciones
    const estacionIds = [828537, 828524, 828523, 828534, 828535, 828538];
    const estados = {};
    
    for (const id of estacionIds) {
      const estado = await kv.get(`estado_${id}`);
      estados[id] = estado || [];
    }
    
    return new Response(JSON.stringify({
      logs: recentLogs,
      estados,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
