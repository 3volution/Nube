const COGNITO_URL = "https://cognito-idp.eu-west-1.amazonaws.com/";
const CLIENT_ID = "539ogq18bspa4d1v2bi01g5c01";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const ESTACIONES = [
  { nombre: "Estacion Bus", id: 828537, direccion: "Av. de la Libertad, Mérida" },
  { nombre: "Avda. Roma", id: 828524, direccion: "Avda. de Roma, Mérida" },
  { nombre: "Plaza Xirgu", id: 828523, direccion: "Pl. Margarita Xirgu, Mérida" },
  { nombre: "Calle Almendralejo (1)", id: 828534, direccion: "C. Almendralejo, Mérida" },
  { nombre: "Calle Almendralejo (2)", id: 828535, direccion: "C. Almendralejo, Mérida" },
  { nombre: "Avda. del Prado", id: 828538, direccion: "Avda. del Prado, Mérida" }
];

function expandirEstaciones() {
  const result = [];
  for (const est of ESTACIONES) {
    if (est.ids) {
      for (const id of est.ids) {
        result.push({ nombre: est.nombre, id, direccion: est.direccion });
      }
    } else {
      result.push({ nombre: est.nombre, id: est.id, direccion: est.direccion });
    }
  }
  return result;
}

async function obtenerTokenElectromaps(user, pass) {
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
  return data.connectors.map(c => ({
    id: c.id,
    visualRef: c.visualRef,
    status: c.status
  }));
}

async function enviarTelegram(mensaje) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: mensaje })
  });
}

async function guardarLog(tipo, estacion, mensaje) {
  const timestamp = new Date().toISOString();
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "apikey": SUPABASE_KEY
      },
      body: JSON.stringify({
        timestamp,
        message: `[${tipo.toUpperCase()}] ${estacion}: ${mensaje}`,
        level: tipo.toUpperCase(),
        station_id: estacion
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error("[v0] Error guardando log en Supabase:", error);
    }
  } catch (error) {
    console.error("[v0] Error al guardar log:", error.message);
  }
}

export default async function handler(req, res) {
  if (req.query.token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = process.env.ELECTROMAPS_USER;
    const pass = process.env.ELECTROMAPS_PASS;
    if (!user || !pass) throw new Error("Faltan credenciales Electromaps");

    await guardarLog("INFO", "Sistema", "Iniciando monitoreo...");

    const token = await obtenerTokenElectromaps(user, pass);
    const estacionesLista = expandirEstaciones();
    let notificacionesEnviadas = 0;
    let cambiosDetectados = [];

    console.log("[v0] Token obtenido de Electromaps");
    console.log("[v0] SUPABASE_URL:", SUPABASE_URL ? "✓ Configurada" : "✗ NO");
    console.log("[v0] SUPABASE_KEY:", SUPABASE_KEY ? "✓ Configurada" : "✗ NO");
    console.log("[v0] Consultando", estacionesLista.length, "estaciones");

    for (const est of estacionesLista) {
      try {
        const actuales = await consultarEstado(est.id, token);
        
        // Obtener estado anterior de Supabase
        const getResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/charger_state?station_id=eq.${est.id}`,
          {
            headers: {
              "Authorization": `Bearer ${SUPABASE_KEY}`,
              "apikey": SUPABASE_KEY
            }
          }
        );
        
        const estadoData = await getResponse.json();
        let anteriores = [];
        
        if (Array.isArray(estadoData) && estadoData.length > 0) {
          anteriores = estadoData[0].state || [];
        }

        for (const con of actuales) {
          const prev = anteriores.find(c => c.id === con.id);
          
          // Si no existía antes o cambió de estado, actualizar timestamp
          if (!prev || prev.status !== con.status) {
            con.status_changed_at = new Date().toISOString();
          } else if (prev.status_changed_at) {
            // Mantener el timestamp anterior si el estado no cambió
            con.status_changed_at = prev.status_changed_at;
          }
          
          if (prev) {
            const estabaOcupado = (prev.status !== "FREE" && prev.status !== "AVAILABLE");
            const ahoraLibre = (con.status === "FREE" || con.status === "AVAILABLE");
            if (estabaOcupado && ahoraLibre) {
              const nombre = con.visualRef || con.id;
              const hora = new Date().toLocaleTimeString('es-ES');
              const mensaje = `🔔 *${nombre}* se ha liberado en *${est.nombre}*\n⏰ ${hora}\n📍 ${est.direccion}\nEstado: ${prev.status} → ${con.status}`;
              
              await enviarTelegram(mensaje);
              
              cambiosDetectados.push({
                estacion: est.nombre,
                conector: nombre,
                estadoAnterior: prev.status,
                estadoNuevo: con.status,
                timestamp: new Date().toISOString()
              });
              
              await guardarLog("CAMBIO", est.nombre, `Conector ${nombre} cambió de ${prev.status} a ${con.status}`);
              notificacionesEnviadas++;
            }
          }
        }
        
        // Guardar estado actual en Supabase con timestamps
        console.log("[v0] Guardando estado para estación:", est.nombre, "ID:", est.id);
        console.log("[v0] Datos:", JSON.stringify({
          station_id: String(est.id),
          station_name: est.nombre,
          state: actuales,
          last_check: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
        
        const upsertResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/charger_state`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_KEY}`,
              "apikey": SUPABASE_KEY,
              "Prefer": "resolution=merge-duplicates"
            },
            body: JSON.stringify({
              station_id: String(est.id),
              station_name: est.nombre,
              state: actuales,
              last_check: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
          }
        );
        
        console.log("[v0] Upsert response status:", upsertResponse.status);
        
        if (!upsertResponse.ok) {
          const error = await upsertResponse.text();
          console.error("[v0] Error guardando estado:", error);
          await guardarLog("ERROR", est.nombre, `Error guardando estado: ${error}`);
        } else {
          console.log("[v0] Estado guardado exitosamente para", est.nombre);
          await guardarLog("SUCCESS", est.nombre, `Consultada exitosamente. ${actuales.length} conectores.`);
        }
      } catch (error) {
        await guardarLog("ERROR", est.nombre, `Error: ${error.message}`);
      }
    }

    await guardarLog("INFO", "Sistema", `Monitoreo completado. ${notificacionesEnviadas} notificaciones enviadas.`);
    
    res.status(200).json({ 
      success: true, 
      notifications: notificacionesEnviadas,
      cambios: cambiosDetectados,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[v0] Error crítico:", error);
    await guardarLog("ERROR", "Sistema", `Error crítico: ${error.message}`);
    await enviarTelegram(`⚠️ Error crítico en el monitor: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}
