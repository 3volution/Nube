import { createClient } from '@supabase/supabase-js';
import { obtenerDatosEstacion } from '@/api/electromaps';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }
  
  return createClient(url, key);
}

/**
 * POST /api/watcher - Crear nueva vigilancia
 * Body: { station_id, station_name }
 */
export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return Response.json({ error: 'Body debe ser JSON valido' }, { status: 400 });
    }

    const { station_id, station_name } = body;

    if (!station_id || !station_name) {
      return Response.json({ error: 'station_id y station_name son requeridos' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // Verificar si ya existe vigilancia activa para esta estacion
    const { data: existing, error: existingError } = await supabase
      .from('active_watchers')
      .select('id, status')
      .eq('station_id', station_id)
      .eq('status', 'active')
      .maybeSingle();

    if (existingError) {
      console.error('Error buscando vigilancias:', existingError.message);
      return Response.json({ error: 'Error en BD' }, { status: 500 });
    }

    if (existing) {
      return Response.json(
        { error: 'Ya existe una vigilancia activa para esta estacion' },
        { status: 409 }
      );
    }

    // Consultar estado actual de los conectores en Electromaps
    const user = process.env.ELECTROMAPS_USER;
    const pass = process.env.ELECTROMAPS_PASS;

    if (!user || !pass) {
      return Response.json({ error: 'Credenciales de Electromaps no configuradas' }, { status: 500 });
    }

    let conectores;
    try {
      conectores = await obtenerDatosEstacion(station_id, user, pass);
    } catch (electromapsError) {
      console.error('Error en Electromaps:', electromapsError.message);
      return Response.json({ error: 'Error Electromaps: ' + electromapsError.message }, { status: 503 });
    }

    if (!conectores || conectores.length === 0) {
      return Response.json(
        { error: 'No se pudo obtener el estado de los conectores. Intentalo de nuevo.' },
        { status: 503 }
      );
    }

    // Si ya existe un cargador libre, vigilancia innecesaria
    const hayLibre = conectores.some(c => c.status === 'FREE');
    if (hayLibre) {
      return Response.json(
        { error: 'Ya existe un cargador libre en esta estacion. No es necesario activar vigilancia.' },
        { status: 422 }
      );
    }

    // Crear snapshot del estado actual de los conectores
    const connectorStates = {};
    conectores.forEach(c => {
      connectorStates[c.id] = c.status;
    });

    // Limpiar vigilancias anteriores no activas
    await supabase
      .from('active_watchers')
      .delete()
      .eq('station_id', station_id)
      .neq('status', 'active');

    const { data: watcher, error: insertError } = await supabase
      .from('active_watchers')
      .insert({
        station_id,
        station_name,
        last_connector_states: connectorStates,
        status: 'active',
        retry_count: 0
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creando vigilancia:', insertError.message);
      return Response.json({ error: 'Error BD: ' + insertError.message }, { status: 500 });
    }

    return Response.json({ success: true, watcher }, { status: 201 });

  } catch (error) {
    console.error('Error en POST /api/watcher:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/watcher - Obtener vigilancias activas
 */
export async function GET() {
  try {
    const supabase = getSupabaseClient();

    const { data: watchers, error } = await supabase
      .from('active_watchers')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo vigilancias:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ watchers: watchers || [] }, { status: 200 });

  } catch (error) {
    console.error('Error en GET /api/watcher:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/watcher - Cancelar vigilancia
 * Query: ?station_id=XXX
 */
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const station_id = searchParams.get('station_id');

    if (!station_id) {
      return Response.json({ error: 'station_id es requerido' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('active_watchers')
      .update({ status: 'cancelled' })
      .eq('station_id', station_id)
      .eq('status', 'active')
      .select()
      .single();

    if (error) {
      console.error('Error cancelando vigilancia:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return Response.json({ error: 'No se encontro vigilancia activa para esta estacion' }, { status: 404 });
    }

    return Response.json({ success: true, cancelled: data }, { status: 200 });

  } catch (error) {
    console.error('Error en DELETE /api/watcher:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
