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

async function obtenerTimestampConector(connectorId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/connector_timestamps?connector_id=eq.${connectorId}`,
      {
        headers: {
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "apikey": SUPABASE_KEY
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.length > 0 ? data[0] : null;
    }
    return null;
  } catch (error) {
    console.error(`[v0] Error obteniendo timestamp para ${connectorId}:`, error.message);
    return null;
  }
}

async function guardarTimestampConector(connectorId, stationId, status, statusChangedAt) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/connector_timestamps?connector_id=eq.${connectorId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "apikey": SUPABASE_KEY
        },
        body: JSON.stringify({
          connector_id: String(connectorId),
          station_id: String(stationId),
          status: status,
          status_changed_at: statusChangedAt
        })
      }
    );

    if (!response.ok) {
      // Si PUT falla (no existe), hacer INSERT
      const insertResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/connector_timestamps`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "apikey": SUPABASE_KEY
          },
          body: JSON.stringify({
            connector_id: String(connectorId),
            station_id: String(stationId),
            status: status,
            status_changed_at: statusChangedAt
          })
        }
      );

      if (!insertResponse.ok) {
        const error = await insertResponse.text();
        console.error(`[v0] Error guardando timestamp para ${connectorId}:`, error);
      } else {
        console.log(`[v0] Timestamp creado para conector ${connectorId}: ${statusChangedAt}`);
      }
    } else {
      console.log(`[v0] Timestamp actualizado para conector ${connectorId}: ${statusChangedAt}`);
    }
  } catch (error) {
    console.error(`[v0] Error al guardar timestamp:`, error.message);
  }
}

async function guardarCambioEstado(connectorId, stationId, stationName, estadoAnterior, estadoNuevo, tiempoEnEstadoAnterior) {
  try {
    const ahora = new Date();
    const fecha = ahora.toISOString().split('T')[0];
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dia = dias[ahora.getDay()];
    const hora = ahora.toTimeString().slice(0, 8);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/connector_state_changes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "apikey": SUPABASE_KEY
      },
      body: JSON.stringify({
        timestamp: ahora.toISOString(),
        fecha,
        dia,
        hora,
        connector_id: String(connectorId),
        station_id: String(stationId),
        station_name: stationName,
        estado_anterior: estadoAnterior,
        estado_nuevo: estadoNuevo,
        tiempo_en_estado_anterior_segundos: tiempoEnEstadoAnterior
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[v0] Error guardando cambio de estado:", error);
    } else {
      console.log("[v0] Cambio de estado registrado:", connectorId, estadoAnterior, "→", estadoNuevo);
    }
  } catch (error) {
    console.error("[v0] Error al guardar cambio de estado:", error.message);
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

    // Cargadores de prueba (controlados via Telegram - cualquier ID)
    let cargadoresPrueba = {};
    try {
      const resPrueba = await fetch(`${SUPABASE_URL}/rest/v1/test_connectors`, {
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY
        }
      });
      const dataPrueba = await resPrueba.json();
      dataPrueba.forEach(c => {
        cargadoresPrueba[c.connector_id] = {
          status: c.status,
          status_updated_at: c.status_updated_at
        };
      });
      console.log("[v0] Cargadores de prueba:", Object.keys(cargadoresPrueba).length);
    } catch (e) {
      console.log("[v0] Error obteniendo cargadores de prueba:", e.message);
    }

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

        // Crear timestamps escalonados POR CADA ESTACIÓN - SECUENCIAL
        const now = new Date();
        
        // Procesar cada conector con su offset secuencial
        for (let index = 0; index < actuales.length; index++) {
          const con = actuales[index];
          const prev = anteriores.find(c => c.id === con.id);
          
          // OVERRIDE: Si hay datos de prueba para este cargador, usarlos
          const visualRef = con.visualRef || String(con.id);
          if (cargadoresPrueba[visualRef]) {
            con.status = cargadoresPrueba[visualRef].status;
            con.status_updated_at = cargadoresPrueba[visualRef].status_updated_at;
            console.log(`[v0] Cargador de prueba ${visualRef}: ${con.status}`);
          }
          
          // Calcular timestamp escalonado (0, 1, 2, 3... segundos atrás)
          const offsetTimestamp = new Date(now.getTime() - (index * 1000));
          const offsetTimestampISO = offsetTimestamp.toISOString();
          
          // Campos debug (usar propiedades normales sin guión bajo)
          con.debug_offset = index;
          con.debug_timestamp_calculated = offsetTimestampISO;
          
          if (prev && prev.status !== con.status) {
            // Estado CAMBIO - crear timestamp nuevo (ahora)
            con.status_changed_at = new Date().toISOString();
            
            // Registrar cambio de estado SIEMPRE que haya un cambio
            const ahora = new Date();
            let tiempoEnSegundos = 0;
            
            // DEBUG: Ver que valores tiene prev
            console.log(`[v0] DEBUG prev para ${con.visualRef || con.id}:`, {
              prev_status: prev.status,
              prev_status_changed_at: prev.status_changed_at,
              prev_status_updated_at: prev.status_updated_at
            });
            
            // Usar status_changed_at o status_updated_at como fallback
            const prevTimestampStr = prev.status_changed_at || prev.status_updated_at;
            if (prevTimestampStr) {
              const prevTimestamp = new Date(prevTimestampStr);
              tiempoEnSegundos = Math.floor((ahora - prevTimestamp) / 1000);
              console.log(`[v0] DEBUG tiempo calculado: ${tiempoEnSegundos}s (${Math.floor(tiempoEnSegundos/60)}m)`);
            } else {
              console.log(`[v0] DEBUG: No hay timestamp previo, tiempo = 0`);
            }
            
            await guardarCambioEstado(con.visualRef || con.id, est.id, est.nombre, prev.status, con.status, tiempoEnSegundos);
            console.log(`[v0] CAMBIO DETECTADO: ${est.nombre} - Conector ${con.visualRef || con.id}: ${prev.status} -> ${con.status} (${tiempoEnSegundos}s)`);
            
            // Notificación solo si cambió a LIBRE
            const estabaOcupado = prev.status !== "FREE" && prev.status !== "AVAILABLE";
            const ahoraLibre = con.status === "FREE" || con.status === "AVAILABLE";
            if (estabaOcupado && ahoraLibre) {
              const hora = new Date().toLocaleTimeString('es-ES');
              const mensaje = `🔔 *${con.visualRef || con.id}* se liberó en *${est.nombre}*\n⏰ ${hora}\n📍 ${est.direccion}`;
              await enviarTelegram(mensaje);
              await guardarLog("CAMBIO", est.nombre, `Conector ${con.visualRef || con.id} cambió a LIBRE`);
              notificacionesEnviadas++;
            }
          } else {
            // Estado NO CAMBIÓ o es primer registro - usar timestamp escalonado
            con.status_changed_at = offsetTimestampISO;
          }
        }
        
        // DEBUG: Log de los offsets que se van a guardar
        console.log(`[v0 OFFSET] Estación ${est.nombre}: offsets =`, actuales.map((c, i) => ({ id: c.id, timestamp: c.status_changed_at, index: i, debug_offset: c._debug_offset, debug_ts: c._debug_timestamp_calculated })));
        
        // Guardar estado actual en Supabase con timestamps
        
        // Usar UPSERT en lugar de DELETE + INSERT para mantener los timestamps
        const bodyToSave = {
          station_id: String(est.id),
          station_name: est.nombre,
          state: actuales,
          last_check: new Date().toISOString()
        };
        
        console.log(`[v0 SAVE] Guardando para ${est.nombre}:`, JSON.stringify(bodyToSave.state[0], null, 2));
        
        const upsertResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/charger_state?station_id=eq.${est.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_KEY}`,
              "apikey": SUPABASE_KEY,
              "Prefer": "return=minimal"
            },
            body: JSON.stringify(bodyToSave)
          }
        );
        
        if (!upsertResponse.ok) {
          // Si UPDATE falla, hacer DELETE + INSERT
          const deleteResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/charger_state?station_id=eq.${est.id}`,
            {
              method: "DELETE",
              headers: {
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "apikey": SUPABASE_KEY
              }
            }
          );
          
          const insertResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/charger_state`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "apikey": SUPABASE_KEY
              },
              body: JSON.stringify(bodyToSave)
            }
          );
          
          console.log("[v0] Insert response status:", insertResponse.status);
          
          if (!insertResponse.ok) {
            const error = await insertResponse.text();
            console.error("[v0] Error insertando estado:", error);
            await guardarLog("ERROR", est.nombre, `Error insertando: ${error}`);
          } else {
            console.log("[v0] Estado guardado exitosamente para", est.nombre);
            await guardarLog("SUCCESS", est.nombre, `Consultada exitosamente. ${actuales.length} conectores.`);
          }
        } else {
          console.log("[v0] Estado actualizado exitosamente para", est.nombre);
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
    console.error("[v0] Error cr��tico:", error);
    await guardarLog("ERROR", "Sistema", `Error crítico: ${error.message}`);
    await enviarTelegram(`⚠️ Error crítico en el monitor: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}
