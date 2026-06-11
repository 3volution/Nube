import { getSupabaseClient } from '@/app/lib/supabase-client';

/**
 * GET /api/debug/station-usage
 * Analiza cuántas vigilancias activas hay por estación
 * para identificar cuál está generando más Edge Requests
 */

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseClient();

  // Contar vigilancias por estación
  const { data: watchers } = await supabase
    .from('active_watchers')
    .select('station_id, station_name, status')
    .eq('status', 'active');

  // Agrupar y contar
  const stationMap = {};
  if (watchers) {
    watchers.forEach(w => {
      if (!stationMap[w.station_id]) {
        stationMap[w.station_id] = {
          station_id: w.station_id,
          station_name: w.station_name,
          watcher_count: 0
        };
      }
      stationMap[w.station_id].watcher_count++;
    });
  }

  const stations = Object.values(stationMap).sort(
    (a, b) => b.watcher_count - a.watcher_count
  );

  // Calcular impacto si cada vigilancia = 1 Edge Request/minuto
  const stationsWithImpact = stations.map(s => ({
    ...s,
    edge_requests_per_minute: s.watcher_count,
    edge_requests_per_day: s.watcher_count * 60 * 24,
    edge_requests_per_month: s.watcher_count * 60 * 24 * 30
  }));

  const totalWatchers = watchers?.length || 0;
  const totalEdgeRequestsPerMonth = totalWatchers * 60 * 24 * 30;

  return Response.json({
    total_active_watchers: totalWatchers,
    total_stations: stations.length,
    estimated_edge_requests_per_month: totalEdgeRequestsPerMonth,
    note: 'Con redirect:manual y sin errores, cada minuto = N edge requests (donde N = número de vigilancias activas)',
    stations_breakdown: stationsWithImpact
  });
}
