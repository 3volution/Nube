export async function GET(request) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const limit = request.nextUrl.searchParams.get('limit') || 100;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/connector_state_changes?order=id.desc&limit=${limit}`,
      {
        headers: {
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "apikey": SUPABASE_KEY
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Error fetching state changes: ${response.statusText}`);
    }

    const changes = await response.json();

    const formattedChanges = changes.map(change => {
      // Crear timestamp a partir de fecha+hora si no existe
      let timestamp = change.timestamp;
      if (!timestamp && change.fecha && change.hora) {
        timestamp = `${change.fecha}T${change.hora}`;
      }
      
      return {
        id: change.id,
        fecha: change.fecha,
        dia: change.dia,
        hora: change.hora,
        timestamp: timestamp,
        connector_id: change.connector_id,
        station_id: change.station_id,
        station_name: change.station_name,
        old_status: change.estado_anterior,
        new_status: change.estado_nuevo,
        duration_seconds: change.tiempo_en_estado_anterior_segundos,
        tiempoEnEstadoAnterior: change.tiempo_en_estado_anterior_segundos
          ? `${Math.floor(change.tiempo_en_estado_anterior_segundos / 3600)}h ${Math.floor((change.tiempo_en_estado_anterior_segundos % 3600) / 60)}m`
          : 'N/A'
      };
    });

    return Response.json({
      success: true,
      changes: formattedChanges,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[v0] Error fetching state changes:", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
