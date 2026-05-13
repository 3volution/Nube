export async function GET(request) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get('limit') || '50';
  const level = searchParams.get('level'); // INFO, ERROR, CAMBIO, SUCCESS

  try {
    let query = `${SUPABASE_URL}/rest/v1/logs?order=timestamp.desc&limit=${limit}`;
    
    if (level) {
      query += `&level=eq.${level}`;
    }

    const response = await fetch(query, {
      headers: {
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "apikey": SUPABASE_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`Error fetching logs: ${response.statusText}`);
    }

    const logs = await response.json();

    return Response.json({
      success: true,
      count: logs.length,
      logs: logs.map(log => ({
        id: log.id,
        timestamp: new Date(log.timestamp).toLocaleString('es-ES'),
        level: log.level,
        message: log.message,
        station: log.station_id
      }))
    });
  } catch (error) {
    console.error("[v0] Error fetching logs:", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
