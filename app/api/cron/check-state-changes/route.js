import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables not configured');
  return createClient(url, key);
}

/**
 * GET /api/cron/check-state-changes
 * 
 * Registra globalmente todos los cambios de estado de conectores
 * en TODAS las estaciones (no solo vigilancias activas).
 * 
 * Cambios detectados (4 tipos):
 * - OCCUPIED -> AVAILABLE
 * - OCCUPIED -> FREE
 * - AVAILABLE -> OCCUPIED
 * - FREE -> OCCUPIED
 * 
 * Para cada cambio: inserta en connector_state_changes
 * Actualiza snapshot en charger_state
 * 
 * Autenticación: ?secret=<CRON_SECRET> (env var)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    // Validar secret
    if (secret !== process.env.CRON_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ELECTROMAPS_USER = process.env.ELECTROMAPS_USER;
    const ELECTROMAPS_PASS = process.env.ELECTROMAPS_PASS;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

    if (!ELECTROMAPS_USER || !ELECTROMAPS_PASS) {
      return Response.json(
        { success: false, error: 'Credenciales Electromaps no configuradas' },
        { status: 500 }
      );
    }

    // Estaciones a monitorear (copiadas de stations/route.js)
    const ESTACIONES = [
      { nombre: 'Estacion Bus', id: 828537, direccion: 'Av. de la Libertad, Mérida' },
      { nombre: 'Avda. Roma', id: 828524, direccion: 'Avda. de Roma, Mérida' },
      { nombre: 'Plaza Xirgu', id: 828523, direccion: 'Pl. Margarita Xirgu, Mérida' },
      { nombre: 'Calle Almendralejo (1)', id: 828534, direccion: 'C. Almendralejo, Mérida' },
      { nombre: 'Calle Almendralejo (2)', id: 828535, direccion: 'C. Almendralejo, Mérida' },
      { nombre: 'Avda. del Prado', id: 828538, direccion: 'Avda. del Prado, Mérida' }
    ];

    async function obtenerTokenElectromaps(user, pass) {
      const COGNITO_URL = 'https://cognito-idp.eu-west-1.amazonaws.com/';
      const CLIENT_ID = '539ogq18bspa4d1v2bi01g5c01';

      const res = await fetch(COGNITO_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
        },
        body: JSON.stringify({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: CLIENT_ID,
          AuthParameters: { USERNAME: user, PASSWORD: pass }
        })
      });
      const data = await res.json();
      if (data.AuthenticationResult && data.AuthenticationResult.AccessToken) {
        return data.AuthenticationResult.AccessToken;
      }
      throw new Error('Error en login: ' + JSON.stringify(data));
    }

    async function consultarEstado(id, token) {
      const res = await fetch(`https://www.electromaps.com/mapi/v2/locations/${id}`, {
        headers: { Accept: 'application/json', 'X-Em-Oidc-Accesstoken': token }
      });
      const data = await res.json();
      if (!data || !data.connectors) return [];
      return data.connectors;
    }

    const supabase = getSupabaseClient();
    let stationsChecked = 0;
    let changesDetected = 0;
    let changesInserted = 0;
    const errors = [];

    try {
      // Obtener token Electromaps
      const token = await obtenerTokenElectromaps(ELECTROMAPS_USER, ELECTROMAPS_PASS);

      // Procesar cada estación
      for (const estacion of ESTACIONES) {
        try {
          stationsChecked++;

          // Obtener snapshot anterior de charger_state
          const { data: previousSnapshot } = await supabase
            .from('charger_state')
            .select('state')
            .eq('station_id', String(estacion.id))
            .maybeSingle();

          const previousStates = {};
          if (previousSnapshot && previousSnapshot.state && Array.isArray(previousSnapshot.state)) {
            previousSnapshot.state.forEach(c => {
              previousStates[c.id] = c.status;
            });
          }

          // Obtener estado actual de Electromaps
          const conectoresActuales = await consultarEstado(estacion.id, token);
          if (!conectoresActuales || conectoresActuales.length === 0) {
            continue;
          }

          const currentStates = {};
          conectoresActuales.forEach(c => {
            currentStates[c.id] = c.status;
          });

          // Comparar cambios: solo 4 tipos
          const cambiosPermitidos = {
            'OCCUPIED': ['AVAILABLE', 'FREE'],
            'AVAILABLE': ['OCCUPIED'],
            'FREE': ['OCCUPIED'],
          };

          for (const connectorId of Object.keys(currentStates)) {
            const prev = previousStates[connectorId];
            const curr = currentStates[connectorId];

            // Solo detectar cambios si hay estado anterior
            if (prev && curr && prev !== curr && cambiosPermitidos[prev]?.includes(curr)) {
              changesDetected++;

              const freedConnector = conectoresActuales.find(c => c.id === connectorId);
              const chargeEndTime = new Date().toISOString();
              const chargeStartTime = freedConnector?.status_changed_at || chargeEndTime;

              const now = new Date(chargeEndTime);
              const fecha = now.toISOString().split('T')[0]; // YYYY-MM-DD
              const hora = now.toTimeString().split(' ')[0]; // HH:MM:SS
              const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
              const dia = diasSemana[now.getDay()];
              const durationSeconds = Math.floor(
                (new Date(chargeEndTime) - new Date(chargeStartTime)) / 1000
              );

              // Insertar en connector_state_changes
              const { error: insertError } = await supabase
                .from('connector_state_changes')
                .insert({
                  connector_id: String(connectorId),
                  station_id: String(estacion.id),
                  station_name: estacion.nombre,
                  estado_anterior: prev,
                  estado_nuevo: curr,
                  fecha: fecha,
                  dia: dia,
                  hora: hora,
                  timestamp: chargeEndTime,
                  tiempo_en_estado_anterior_segundos: durationSeconds
                });

              if (insertError) {
                errors.push(`[${estacion.nombre} - ${connectorId}] ${insertError.message}`);
              } else {
                changesInserted++;
              }
            }
          }

          // Actualizar snapshot en charger_state usando cliente Supabase
          const formattedConnectors = conectoresActuales.map(c => ({
            id: c.id,
            visualRef: c.visualRef || String(c.id),
            status: c.status,
            status_display: c.status === 'FREE' || c.status === 'AVAILABLE' ? 'LIBRE' : 'OCUPADO',
            status_updated_at: c.status_updated_at,
            status_changed_at: c.status_changed_at
          }));

          const { error: updateError } = await supabase
            .from('charger_state')
            .upsert({
              station_id: String(estacion.id),
              station_name: estacion.nombre,
              state: formattedConnectors,
              last_check: new Date().toISOString()
            }, {
              onConflict: 'station_id'
            });

          if (updateError) {
            errors.push(`[${estacion.nombre}] Error updating charger_state: ${updateError.message}`);
          }

        } catch (stationError) {
          errors.push(`[${estacion.nombre}] ${stationError.message}`);
        }
      }

      return Response.json({
        success: errors.length === 0,
        stations_checked: stationsChecked,
        changes_detected: changesDetected,
        changes_inserted: changesInserted,
        errors: errors.length > 0 ? errors : undefined
      }, { status: 200 });

    } catch (error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('[v0] check-state-changes - error general:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
