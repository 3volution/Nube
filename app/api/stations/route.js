export async function GET(request) {
  const ELECTROMAPS_USER = process.env.ELECTROMAPS_USER;
  const ELECTROMAPS_PASS = process.env.ELECTROMAPS_PASS;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  if (!ELECTROMAPS_USER || !ELECTROMAPS_PASS) {
    return Response.json(
      { success: false, error: "Credenciales de Electromaps no configuradas" },
      { status: 500 }
    );
  }

  // Estaciones a monitorear
  const ESTACIONES = [
    { nombre: "Estacion Bus", id: 828537, direccion: "Av. de la Libertad, Mérida" },
    { nombre: "Avda. Roma", id: 828524, direccion: "Avda. de Roma, Mérida" },
    { nombre: "Plaza Xirgu", id: 828523, direccion: "Pl. Margarita Xirgu, Mérida" },
    { nombre: "Calle Almendralejo (1)", id: 828534, direccion: "C. Almendralejo, Mérida" },
    { nombre: "Calle Almendralejo (2)", id: 828535, direccion: "C. Almendralejo, Mérida" },
    { nombre: "Avda. del Prado", id: 828538, direccion: "Avda. del Prado, Mérida" }
  ];

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

  async function obtenerTokenElectromaps(user, pass) {
    const COGNITO_URL = "https://cognito-idp.eu-west-1.amazonaws.com/";
    const CLIENT_ID = "539ogq18bspa4d1v2bi01g5c01";
    
    const res = await fetch(COGNITO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth"
      },
      body: JSON.stringify({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: CLIENT_ID,
        AuthParameters: { USERNAME: user, PASSWORD: pass }
      })
    });
    const data = await res.json();
    if (data.AuthenticationResult && data.AuthenticationResult.AccessToken) {
      return data.AuthenticationResult.AccessToken;
    }
    throw new Error("Error en login: " + JSON.stringify(data));
  }

  async function consultarEstado(id, token) {
    const res = await fetch(`https://www.electromaps.com/mapi/v2/locations/${id}`, {
      headers: { "Accept": "application/json", "X-Em-Oidc-Accesstoken": token }
    });
    const data = await res.json();
    if (!data || !data.connectors) return [];
    return data.connectors;
  }

  // Cargadores de prueba (controlados via Telegram - cualquier ID)
  async function obtenerCargadoresPrueba() {
    if (!SUPABASE_URL || !SUPABASE_KEY) return {};
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/test_connectors`, {
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY
        }
      });
      const data = await res.json();
      const map = {};
      data.forEach(c => {
        map[c.connector_id] = {
          status: c.status,
          status_updated_at: c.status_updated_at
        };
      });
      return map;
    } catch (e) {
      console.error('[v0] Error obteniendo cargadores de prueba:', e);
      return {};
    }
  }

  try {
    // Obtener token de Electromaps
    const token = await obtenerTokenElectromaps(ELECTROMAPS_USER, ELECTROMAPS_PASS);
    
    // Obtener estado de cargadores de prueba (controlados via Telegram)
    const cargadoresPrueba = await obtenerCargadoresPrueba();
    
    // Obtener datos de todas las estaciones directamente de Electromaps
    const formattedStations = await Promise.all(
      ESTACIONES.map(async (est) => {
        try {
          const conectoresRaw = await consultarEstado(est.id, token);
          
          // DEBUG: Ver qué conectores trae Electromaps
          if (est.id === 828535) {
            console.log(`[v0] Estacion ${est.nombre} (${est.id}) trae conectores:`, conectoresRaw.map(c => c.visualRef || c.id));
          }
          
          // Filtrar conectores específicos según la estación
          let conectoresFiltrados = conectoresRaw;
          if (est.id === 828524) {
            // Avda. Roma - incluir solo 003657, 003658, 003659, 003660
            conectoresFiltrados = conectoresRaw.filter(c => {
              const visualRef = c.visualRef || String(c.id);
              return ['003657', '003658', '003659', '003660'].includes(visualRef);
            });
            console.log(`[v0] Avda. Roma (${est.id}) trae conectores:`, conectoresRaw.map(c => c.visualRef || c.id));
            console.log(`[v0] Avda. Roma despues del filtro:`, conectoresFiltrados.map(c => c.visualRef || c.id));
          } else if (est.id === 828535) {
            // Calle Almendralejo (2) - excluir 003657 y 003658 que pertenecen a Avda. Roma
            conectoresFiltrados = conectoresRaw.filter(c => {
              const visualRef = c.visualRef || String(c.id);
              return !['003657', '003658'].includes(visualRef);
            });
            console.log(`[v0] Estacion ${est.nombre} (${est.id}) trae conectores:`, conectoresRaw.map(c => c.visualRef || c.id));
            console.log(`[v0] Despues del filtro quedan:`, conectoresFiltrados.map(c => c.visualRef || c.id));
          }
          
          const formattedConnectors = conectoresFiltrados.map(connector => {
            // Verificar si hay override de prueba para este cargador
            const visualRef = connector.visualRef || String(connector.id);
            const datosPrueba = cargadoresPrueba[visualRef] || null;
            
            // Usar datos de prueba si existen, sino usar datos de Electromaps
            const status = datosPrueba ? datosPrueba.status : connector.status;
            const statusUpdatedAt = datosPrueba ? datosPrueba.status_updated_at : connector.status_updated_at;
            
            return {
              id: connector.id,
              visualRef: visualRef,
              status: status,
              status_display: status === 'FREE' || status === 'AVAILABLE' ? 'LIBRE' : 'OCUPADO',
              time_in_state: 'Tiempo real',
              status_updated_at: statusUpdatedAt,
              status_changed_at: statusUpdatedAt,
              es_test: !!datosPrueba
            };
          });
          
          // GUARDAR EN SUPABASE para auditoría e histórico
          if (SUPABASE_URL && SUPABASE_KEY) {
            try {
              await fetch(
                `${SUPABASE_URL}/rest/v1/charger_state?station_id=eq.${est.id}`,
                {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${SUPABASE_KEY}`,
                    "apikey": SUPABASE_KEY,
                    "Prefer": "return=minimal"
                  },
                  body: JSON.stringify({
                    station_id: String(est.id),
                    station_name: est.nombre,
                    state: formattedConnectors,
                    last_check: new Date().toISOString()
                  })
                }
              ).catch(err => console.error(`[v0] Error guardando en Supabase para ${est.nombre}:`, err.message));
            } catch (err) {
              console.error(`[v0] Error saving to Supabase:`, err.message);
            }
          }
          
          return {
            id: est.id,
            name: est.nombre,
            connectors: formattedConnectors,
            lastCheck: new Date().toLocaleString('es-ES'),
            conectoresLibres: formattedConnectors.filter(c => 
              c.status === 'FREE' || c.status === 'AVAILABLE'
            ).length,
            conectoresOcupados: formattedConnectors.filter(c => 
              c.status !== 'FREE' && c.status !== 'AVAILABLE'
            ).length
          };
        } catch (error) {
          console.error(`[v0] Error obteniendo datos de ${est.nombre}:`, error.message);
          return {
            id: est.id,
            name: est.nombre,
            connectors: [],
            lastCheck: new Date().toLocaleString('es-ES'),
            conectoresLibres: 0,
            conectoresOcupados: 0,
            error: error.message
          };
        }
      })
    );

    return Response.json({
      success: true,
      stations: formattedStations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[v0] Error fetching data from Electromaps:", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
