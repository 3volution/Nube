export async function GET(request) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Response.json(
      { success: false, error: "Variables de entorno no configuradas" },
      { status: 500 }
    );
  }

  function formatearTiempoTranscurrido(timestamp) {
    if (!timestamp) {
      return 'Sin datos';
    }
    
    try {
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
    } catch (e) {
      return 'Error en cálculo';
    }
  }

  try {
    // Obtener estaciones
    const stationsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/charger_state?order=station_name.asc`,
      {
        headers: {
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "apikey": SUPABASE_KEY
        }
      }
    );

    if (!stationsRes.ok) {
      throw new Error(`Error fetching charger state: ${stationsRes.status}`);
    }

    const stations = await stationsRes.json();

    // Obtener todos los timestamps de conectores
    const timestampsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/connector_timestamps`,
      {
        headers: {
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "apikey": SUPABASE_KEY
        }
      }
    );

    let timestampMap = {};
    if (timestampsRes.ok) {
      const timestamps = await timestampsRes.json();
      // Crear un mapa de connector_id -> timestamp
      timestamps.forEach(ts => {
        timestampMap[ts.connector_id] = ts.status_changed_at;
      });
    }

    const formattedStations = stations.map(station => {
      const formattedConnectors = (station.state || []).map(connector => {
        // Buscar el timestamp en la tabla connector_timestamps
        const connectorTimestamp = timestampMap[String(connector.id)] || connector.status_changed_at;
        const timeInState = formatearTiempoTranscurrido(connectorTimestamp);
        
        return {
          id: connector.id,
          visualRef: connector.visualRef,
          status: connector.status,
          status_display: connector.status === 'FREE' || connector.status === 'AVAILABLE' ? 'LIBRE' : 'OCUPADO',
          time_in_state: timeInState,
          status_changed_at: connectorTimestamp
        };
      });
      
      return {
        id: station.station_id,
        name: station.station_name,
        connectors: formattedConnectors,
        lastCheck: new Date(station.last_check).toLocaleString('es-ES'),
        conectoresLibres: formattedConnectors.filter(c => 
          c.status === 'FREE' || c.status === 'AVAILABLE'
        ).length,
        conectoresOcupados: formattedConnectors.filter(c => 
          c.status !== 'FREE' && c.status !== 'AVAILABLE'
        ).length
      };
    });

    return Response.json({
      success: true,
      stations: formattedStations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[v0] Error fetching data:", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
