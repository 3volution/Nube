// Funciones compartidas para conectar con Electromaps

const COGNITO_URL = "https://cognito-idp.eu-west-1.amazonaws.com/";
const CLIENT_ID = "539ogq18bspa4d1v2bi01g5c01";

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

async function obtenerDatosEstacion(stationId, user, pass) {
  try {
    const token = await obtenerTokenElectromaps(user, pass);
    const conectores = await consultarEstado(stationId, token);
    return conectores;
  } catch (error) {
    console.error(`[v0] Error obteniendo datos de estación ${stationId}:`, error.message);
    return [];
  }
}

module.exports = { obtenerTokenElectromaps, consultarEstado, obtenerDatosEstacion };

export { obtenerTokenElectromaps, consultarEstado, obtenerDatosEstacion };
