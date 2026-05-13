export async function GET(request) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  console.log("[v0] SUPABASE_URL:", SUPABASE_URL ? "✓ CONFIGURADA" : "✗ NO ENCONTRADA");
  console.log("[v0] SUPABASE_KEY:", SUPABASE_KEY ? "✓ CONFIGURADA" : "✗ NO ENCONTRADA");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Response.json(
      { success: false, error: "Variables de entorno no configuradas (SUPABASE_URL o SUPABASE_ANON_KEY falta)" },
      { status: 500 }
    );
  }

  function formatearTiempoTranscurrido(timestamp) {
    if (!timestamp) return 'Sin datos';
    const fecha = new Date(timestamp);
    const ahora = new Date();
    const diferencia = ahora - fecha;
    
    const minutos = Math.floor(diferencia / 60000);
    const horas = Math.floor(minutos / 60);
    const dias = Math.floor(horas / 24);
    
    if (minutos < 1) return 'Hace segundos';
    if (minutos < 60) return `Hace ${minutos}m`;
    if (horas < 24) return `Hace ${horas}h ${minutos % 60}m`;
    return `Hace ${dias}d ${horas % 24}h`;
  }

  try {
    console.log("[v0] Fetching from:", `${SUPABASE_URL}/rest/v1/charger_state`);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/charger_state?order=station_name.asc`,
      {
        headers: {
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "apikey": SUPABASE_KEY
        }
      }
    );

    console.log("[v0] Response status:", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("[v0] Error response:", errorText);
      throw new Error(`Error fetching charger state: ${response.status} ${response.statusText}`);
    }

    const stations = await response.json();

    const formattedStations = stations.map(station => ({
      id: station.station_id,
      name: station.station_name,
      connectors: (station.state || []).map(connector => ({
        id: connector.id,
        visualRef: connector.visualRef,
        status: connector.status,
        status_display: connector.status === 'FREE' || connector.status === 'AVAILABLE' ? 'LIBRE' : 'OCUPADO',
        time_in_state: formatearTiempoTranscurrido(connector.status_changed_at),
        status_changed_at: connector.status_changed_at
      })),
      lastCheck: new Date(station.last_check).toLocaleString('es-ES'),
      conectoresLibres: (station.state || []).filter(c => 
        c.status === 'FREE' || c.status === 'AVAILABLE'
      ).length,
      conectoresOcupados: (station.state || []).filter(c => 
        c.status !== 'FREE' && c.status !== 'AVAILABLE'
      ).length
    }));

    return Response.json({
      success: true,
      stations: formattedStations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[v0] Error fetching charger state:", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
