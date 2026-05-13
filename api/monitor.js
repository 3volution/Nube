// api/monitor.js
const COGNITO_URL = "https://cognito-idp.eu-west-1.amazonaws.com/";
const CLIENT_ID = "539ogq18bspa4d1v2bi01g5c01";

const ESTACIONES = [
  { nombre: "Estacion Bus", id: 828537 }
];

let estadoAnterior = {};

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

export default async function handler(req, res) {
  if (req.query.token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = process.env.ELECTROMAPS_USER;
    const pass = process.env.ELECTROMAPS_PASS;
    if (!user || !pass) throw new Error("Faltan credenciales");

    const token = await obtenerTokenElectromaps(user, pass);
    
    for (const est of ESTACIONES) {
      const actuales = await consultarEstado(est.id, token);
      const clave = `estado_${est.id}`;
      const anteriores = estadoAnterior[clave] || [];

      for (const con of actuales) {
        const prev = anteriores.find(c => c.id === con.id);
        if (prev) {
          const estabaOcupado = (prev.status !== "FREE" && prev.status !== "AVAILABLE");
          const ahoraLibre = (con.status === "FREE" || con.status === "AVAILABLE");
          if (estabaOcupado && ahoraLibre) {
            const nombre = con.visualRef || con.id;
            await enviarTelegram(`🔔 *${nombre}* se ha liberado en *${est.nombre}*`);
          }
        }
      }
      estadoAnterior[clave] = actuales;
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    await enviarTelegram(`⚠️ Error en el monitor: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}
