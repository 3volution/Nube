const BUS_STATION_ID = "828537";

const ESTACIONES = [
  {
    nombre: "Estacion Bus",
    id: 828537,
    direccion: "Av. de la Libertad, Mérida"
  },
  {
    nombre: "Avda. Roma",
    id: 828524,
    direccion: "Avda. de Roma, Mérida"
  },
  {
    nombre: "Plaza Xirgu",
    id: 828523,
    direccion: "Pl. Margarita Xirgu, Mérida"
  },
  {
    nombre: "Calle Almendralejo (1)",
    id: 828534,
    direccion: "C. Almendralejo, Mérida"
  },
  {
    nombre: "Calle Almendralejo (2)",
    id: 828535,
    direccion: "C. Almendralejo, Mérida"
  },
  {
    nombre: "Avda. del Prado",
    id: 828538,
    direccion: "Avda. del Prado, Mérida"
  }
];

function normalizeStatus(rawStatus) {
  const raw = String(
    rawStatus ?? "UNKNOWN"
  ).toUpperCase();

  if (
    raw === "FREE" ||
    raw === "AVAILABLE"
  ) {
    return "AVAILABLE";
  }

  if (raw === "OCCUPIED") {
    return "OCCUPIED";
  }

  if (
    raw === "OUT_OF_SERVICE" ||
    raw === "BROKEN" ||
    raw === "UNAVAILABLE"
  ) {
    return "OUT_OF_SERVICE";
  }

  return "UNKNOWN";
}

function filterConnectors(stationId, connectors) {
  if (stationId === 828524) {
    const allowed = new Set([
      "003657",
      "003658",
      "003659",
      "003660"
    ]);

    return connectors.filter(connector =>
      allowed.has(
        String(
          connector.visualRef ??
          connector.id
        )
      )
    );
  }

  if (stationId === 828535) {
    const excluded = new Set([
      "003657",
      "003658"
    ]);

    return connectors.filter(connector =>
      !excluded.has(
        String(
          connector.visualRef ??
          connector.id
        )
      )
    );
  }

  return connectors;
}

function ageSeconds(timestamp, now) {
  if (!timestamp) {
    return null;
  }

  const start = new Date(timestamp);

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  return Math.max(
    0,
    Math.floor(
      (now.getTime() - start.getTime()) /
      1000
    )
  );
}

async function getElectromapsToken(user, pass) {
  const response = await fetch(
    "https://cognito-idp.eu-west-1.amazonaws.com/",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-amz-json-1.1",
        "X-Amz-Target":
          "AWSCognitoIdentityProviderService.InitiateAuth"
      },
      body: JSON.stringify({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId:
          "539ogq18bspa4d1v2bi01g5c01",
        AuthParameters: {
          USERNAME: user,
          PASSWORD: pass
        }
      })
    }
  );

  const data = await response.json();

  const token =
    data?.AuthenticationResult?.AccessToken;

  if (!token) {
    throw new Error(
      "ELECTROMAPS_AUTH_FAILED"
    );
  }

  return token;
}

async function getLiveConnectors(
  stationId,
  token
) {
  const response = await fetch(
    `https://www.electromaps.com/mapi/v2/locations/${stationId}`,
    {
      headers: {
        Accept: "application/json",
        "X-Em-Oidc-Accesstoken": token
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(
      `ELECTROMAPS_HTTP_${response.status}`
    );
  }

  const data = await response.json();

  return filterConnectors(
    stationId,
    Array.isArray(data?.connectors)
      ? data.connectors
      : []
  );
}

async function getPersistedState(
  stationId,
  supabaseUrl,
  supabaseKey
) {
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/charger_state?station_id=eq.${stationId}&select=station_id,station_name,state,last_check`,
      {
        method: "GET",
        headers: {
          Authorization:
            `Bearer ${supabaseKey}`,
          apikey: supabaseKey
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return null;
    }

    const rows = await response.json();

    return (
      Array.isArray(rows) &&
      rows.length > 0
        ? rows[0]
        : null
    );
  } catch {
    return null;
  }
}

function normalizeConnector(
  live,
  persistedRow,
  now
) {
  const status =
    normalizeStatus(live.status);

  const persisted =
    Array.isArray(persistedRow?.state)
      ? persistedRow.state.find(
          item =>
            String(item.id) ===
            String(live.id)
        )
      : null;

  const persistedStatus =
    persisted
      ? normalizeStatus(persisted.status)
      : null;

  // Misma fecha que utiliza la interfaz de HackerCharger.
  // El estado almacenado es respaldo si coincide con el actual.
  const liveTimestamp =
    typeof live.status_updated_at === "string"
      ? live.status_updated_at
      : null;

  const persistedTimestamp =
    persisted && persistedStatus === status
      ? (persisted.status_changed_at || persisted.status_updated_at || null)
      : null;

  const stateSince = liveTimestamp || persistedTimestamp;
  const seconds = ageSeconds(stateSince, now);

  const trustedAge =
    (status === "OCCUPIED" || status === "AVAILABLE") &&
    !persisted?.es_test &&
    seconds !== null &&
    new Date(stateSince).getTime() <= now.getTime();

  return {
    id: String(live.id),
    visual_ref: String(
      live.visualRef ?? live.id
    ),
    raw_status:
      live.status ?? "UNKNOWN",
    status,
    available:
      status === "AVAILABLE",
    state_since:
      trustedAge ? stateSince : null,
    state_age_seconds:
      trustedAge
        ? ageSeconds(stateSince, now)
        : null,
    state_age_trusted:
      trustedAge
  };
}

function isAuthorized(request) {
  const expected =
    process.env.RIDER_CHARGER_SECRET;

  if (!expected) {
    return false;
  }

  const header =
    request.headers.get("authorization");

  return (
    header === `Bearer ${expected}`
  );
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json(
      {
        ok: false,
        error: "UNAUTHORIZED"
      },
      {
        status: 401
      }
    );
  }

  const user =
    process.env.ELECTROMAPS_USER;

  const pass =
    process.env.ELECTROMAPS_PASS;

  const supabaseUrl =
    process.env.SUPABASE_URL;

  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!user || !pass) {
    return Response.json(
      {
        ok: false,
        error:
          "ELECTROMAPS_NOT_CONFIGURED"
      },
      {
        status: 503
      }
    );
  }

  try {
    const token =
      await getElectromapsToken(
        user,
        pass
      );

    const observedAt =
      new Date().toISOString();

    const now =
      new Date(observedAt);

    const stations =
      await Promise.all(
        ESTACIONES.map(
          async station => {
            const [
              liveConnectors,
              persisted
            ] = await Promise.all([
              getLiveConnectors(
                station.id,
                token
              ),
              getPersistedState(
                station.id,
                supabaseUrl,
                supabaseKey
              )
            ]);

            const connectors =
              liveConnectors.map(
                connector =>
                  normalizeConnector(
                    connector,
                    persisted,
                    now
                  )
              );

            return {
              station_id:
                String(station.id),
              station_name:
                station.nombre,
              address:
                station.direccion,
              connectors,
              free_count:
                connectors.filter(
                  c =>
                    c.status ===
                    "AVAILABLE"
                ).length,
              occupied_count:
                connectors.filter(
                  c =>
                    c.status ===
                    "OCCUPIED"
                ).length,
              out_of_service_count:
                connectors.filter(
                  c =>
                    c.status ===
                    "OUT_OF_SERVICE"
                ).length,
              unknown_count:
                connectors.filter(
                  c =>
                    c.status ===
                    "UNKNOWN"
                ).length
            };
          }
        )
      );

    const bus =
      stations.find(
        station =>
          station.station_id ===
          BUS_STATION_ID
      );

    if (!bus) {
      throw new Error(
        "BUS_STATION_MISSING"
      );
    }

    const alternatives =
      stations
        .filter(
          station =>
            station.station_id !==
            BUS_STATION_ID
        )
        .filter(
          station =>
            station.free_count > 0
        )
        .map(station => ({
          station_id:
            station.station_id,
          station_name:
            station.station_name,
          address:
            station.address,
          free_count:
            station.free_count,
          free_connectors:
            station.connectors
              .filter(
                connector =>
                  connector.available
              )
              .map(
                connector => ({
                  id: connector.id,
                  visual_ref:
                    connector.visual_ref
                })
              )
        }));

    const canOfferWatch =
      bus.free_count === 0 &&
      bus.occupied_count > 0;

    return Response.json({
      ok: true,
      source: "hackercharger",
      observed_at: observedAt,
      station: bus,
      alternatives,
      watch: {
        can_offer:
          canOfferWatch,
        station_id:
          BUS_STATION_ID,
        confirmation:
          canOfferWatch
            ? "¿Quieres que vigile los cargadores de Estación de Autobuses y te haga una llamada de teléfono automática en cuanto alguno se quede libre?"
            : null
      }
    });
  } catch (error) {
    console.error(
      "[Rider chargers]",
      error?.message
    );

    return Response.json(
      {
        ok: false,
        error:
          "CHARGER_AVAILABILITY_UNAVAILABLE"
      },
      {
        status: 503
      }
    );
  }
}
