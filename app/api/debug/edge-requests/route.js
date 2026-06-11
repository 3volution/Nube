import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables not configured');
  return createClient(url, key);
}

/**
 * GET /api/debug/edge-requests
 * Endpoint para diagnosticar consumo de Edge Requests
 * 
 * Simula una ejecución de watcher/check y loguea:
 * - Número de fetch calls
 * - Status de cada respuesta (sin seguir redirects)
 * - Headers de redirect si existen
 * - Tamaño de respuesta
 * - Tiempo total
 */

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  // Validación básica
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const fetchStats = [];

  try {
    const supabase = getSupabaseClient();

    // Obtener vigilancias activas
    const { data: watchers } = await supabase
      .from('active_watchers')
      .select('id, station_id, station_name')
      .eq('status', 'active');

    if (!watchers || watchers.length === 0) {
      return Response.json({
        error: 'Sin vigilancias activas',
        duration_ms: Date.now() - startTime
      });
    }

    const user = process.env.ELECTROMAPS_USER;
    const pass = process.env.ELECTROMAPS_PASS;

    // Simular obtención de token (sin seguir redirects automáticos)
    console.log('[v0] === COGNITO LOGIN (redirect: manual) ===');
    const cognitoStart = Date.now();
    const cognitoRes = await fetch('https://cognito-idp.eu-west-1.amazonaws.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: '539ogq18bspa4d1v2bi01g5c01',
        AuthParameters: { USERNAME: user, PASSWORD: pass }
      }),
      redirect: 'manual'
    });

    fetchStats.push({
      service: 'Cognito',
      status: cognitoRes.status,
      statusText: cognitoRes.statusText,
      headers: {
        'content-type': cognitoRes.headers.get('content-type'),
        'location': cognitoRes.headers.get('Location'),
        'content-length': cognitoRes.headers.get('content-length')
      },
      duration_ms: Date.now() - cognitoStart
    });

    // Consultar Electromaps para cada vigilancia
    for (const watcher of watchers) {
      console.log(`[v0] === ELECTROMAPS: ${watcher.station_name} (${watcher.station_id}) ===`);
      const emStart = Date.now();

      const emRes = await fetch(
        `https://www.electromaps.com/mapi/v2/locations/${watcher.station_id}`,
        {
          headers: {
            'Accept': 'application/json',
            'X-Em-Oidc-Accesstoken': 'test-token'
          },
          redirect: 'manual'
        }
      );

      const contentType = emRes.headers.get('content-type');
      let bodyPreview = '';

      if (contentType && contentType.includes('application/json')) {
        try {
          const json = await emRes.json();
          bodyPreview = JSON.stringify(json).substring(0, 200);
        } catch {
          bodyPreview = '(JSON inválido)';
        }
      }

      fetchStats.push({
        service: `Electromaps: ${watcher.station_name}`,
        station_id: watcher.station_id,
        status: emRes.status,
        statusText: emRes.statusText,
        headers: {
          'content-type': contentType,
          'location': emRes.headers.get('Location'),
          'content-length': emRes.headers.get('content-length')
        },
        body_preview: bodyPreview,
        duration_ms: Date.now() - emStart
      });
    }

    const totalDuration = Date.now() - startTime;

    return Response.json({
      timestamp: new Date().toISOString(),
      total_fetch_calls: fetchStats.length,
      watchers_checked: watchers.length,
      duration_ms: totalDuration,
      estimated_edge_requests: fetchStats.length, // Con redirect: manual, son exactamente fetchStats.length
      fetch_stats: fetchStats
    });

  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack,
      duration_ms: Date.now() - startTime
    }, { status: 500 });
  }
}
