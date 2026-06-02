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
    console.log('[v0] POST /api/watcher - Iniciando');
    
    let body;
    try {
      body = await request.json();
      console.log('[v0] Body recibido:', body);
    } catch (parseError) {
      console.error('[v0] Error parseando JSON:', parseError.message);
      return Response.json({ 
        error: 'Body debe ser JSON válido', 
        detail: parseError.message,
        stage: 'json_parse'
      }, { status: 400 });
    }

    const { station_id, station_name } = body;
    console.log('[v0] Extrayendo: station_id=', station_id, 'station_name=', station_name);

    if (!station_id || !station_name) {
      return Response.json({ error: 'station_id y station_name son requeridos' }, { status: 400 });
    }

    let supabase;
    try {
      console.log('[v0] Creando cliente Supabase');
      supabase = getSupabaseClient();
      console.log('[v0] Cliente Supabase creado exitosamente');
    } catch (supabaseClientError) {
      console.error('[v0] Error creando cliente Supabase:', supabaseClientError.message);
      return Response.json({ 
        error: 'Error al conectar con BD',
        detail: supabaseClientError.message,
        stage: 'supabase_client_creation'
      }, { status: 500 });
    }

    // Verificar si ya existe vigilancia activa para esta estación
    let existing;
    let existingError;
    try {
      console.log('[v0] Buscando vigilancias existentes para station_id=', station_id);
      const result = await supabase
        .from('active_watchers')
        .select('id, status')
        .eq('station_id', station_id)
        .eq('status', 'active')
        .maybeSingle();
      
      existing = result.data;
      existingError = result.error;
      console.log('[v0] Búsqueda completada. Existing:', existing, 'Error:', existingError?.message);
    } catch (queryError) {
      console.error('[v0] Error ejecutando query de búsqueda:', queryError.message);
      return Response.json({ 
        error: 'Error en BD',
        detail: queryError.message,
        stage: 'check_existing'
      }, { status: 500 });
    }

    if (existingError) {
      console.error('[v0] Error buscando existentes:', existingError.message);
      return Response.json({ 
        error: 'Error en BD: ' + existingError.message,
        stage: 'check_existing_error'
      }, { status: 500 });
    }

    if (existing) {
      console.log('[v0] Vigilancia activa ya existe');
      return Response.json(
        { error: 'Ya existe una vigilancia activa para esta estación' },
        { status: 409 }
      );
    }

    // Consultar estado actual de los conectores en Electromaps
    const user = process.env.ELECTROMAPS_USER;
    const pass = process.env.ELECTROMAPS_PASS;

    if (!user || !pass) {
      console.error('[v0] Credenciales Electromaps faltantes');
      return Response.json({ error: 'Credenciales de Electromaps no configuradas' }, { status: 500 });
    }

    let conectores;
    try {
      console.log('[v0] Consultando Electromaps para station_id=', station_id);
      conectores = await obtenerDatosEstacion(station_id, user, pass);
      console.log('[v0] Conectores obtenidos:', conectores?.length || 0, 'items');
    } catch (electromapsError) {
      console.error('[v0] Error en Electromaps:', {
        message: electromapsError.message,
        code: electromapsError.code,
        stack: electromapsError.stack
      });
      return Response.json({ 
        error: 'Error Electromaps: ' + electromapsError.message,
        detail: electromapsError.stack,
        stage: 'electromaps_query'
      }, { status: 503 });
    }

    // Escenario límite: sin conectores (respuesta vacía o error de Electromaps)
    if (!conectores || conectores.length === 0) {
      console.warn('[v0] Sin conectores para estación', station_id);
      return Response.json(
        { error: 'No se pudo obtener el estado de los conectores. Inténtalo de nuevo.' },
        { status: 503 }
      );
    }

    // Escenario: ya existe un cargador libre — vigilancia innecesaria
    const hayLibre = conectores.some(c => c.status === 'FREE');
    if (hayLibre) {
      console.log('[v0] Ya hay cargador libre en estación', station_id);
      return Response.json(
        { error: 'Ya existe un cargador libre en esta estación. No es necesario activar vigilancia.' },
        { status: 422 }
      );
    }

    // Crear snapshot del estado actual de los conectores
    const connectorStates = {};
    try {
      conectores.forEach(c => {
        connectorStates[c.id] = c.status;
      });
      console.log('[v0] Snapshot de conectores creado:', Object.keys(connectorStates).length, 'conectores');
    } catch (snapshotError) {
      console.error('[v0] Error creando snapshot:', snapshotError.message);
      return Response.json({ 
        error: 'Error procesando datos',
        detail: snapshotError.message,
        stage: 'snapshot_creation'
      }, { status: 500 });
    }

    try {
      console.log('[v0] Limpiando vigilancias anteriores para station_id=', station_id);
      const { error: deleteError } = await supabase
        .from('active_watchers')
        .delete()
        .eq('station_id', station_id)
        .neq('status', 'active');

      if (deleteError) {
        console.error('[v0] Error eliminando vigilancias anteriores:', deleteError);
        // Continuamos aunque falle delete
      }
    } catch (cleanupError) {
      console.error('[v0] Error en cleanup:', cleanupError.message);
      // Continuamos aunque falle
    }

    let watcher;
    let insertError;
    try {
      console.log('[v0] Insertando nueva vigilancia');
      const result = await supabase
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

      watcher = result.data;
      insertError = result.error;
      console.log('[v0] Insert completado. Watcher:', watcher?.id, 'Error:', insertError?.message);
    } catch (insertException) {
      console.error('[v0] Error ejecutando insert:', insertException.message);
      return Response.json({ 
        error: 'Error BD',
        detail: insertException.message,
        stage: 'insert_exception'
      }, { status: 500 });
    }

    if (insertError) {
      console.error('[v0] Error creando vigilancia:', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details
      });
      return Response.json({ 
        error: 'Error BD: ' + insertError.message, 
        code: insertError.code,
        stage: 'insert_error'
      }, { status: 500 });
    }

    console.log('[v0] Vigilancia creada exitosamente:', watcher?.id);
    return Response.json({ success: true, watcher }, { status: 201 });

  } catch (error) {
    console.error('[v0] Error en POST /api/watcher (nivel superior):', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return Response.json({ 
      error: error.message, 
      stack: error.stack,
      stage: 'unknown_error'
    }, { status: 500 });
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
      console.error('[v0] Error obteniendo vigilancias:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ watchers: watchers || [] }, { status: 200 });

  } catch (error) {
    console.error('[v0] Error en GET /api/watcher:', error);
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
      console.error('[v0] Error cancelando vigilancia:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return Response.json({ error: 'No se encontró vigilancia activa para esta estación' }, { status: 404 });
    }

    console.log(`[v0] Vigilancia cancelada para estación ${station_id}`);
    return Response.json({ success: true, cancelled: data }, { status: 200 });

  } catch (error) {
    console.error('[v0] Error en DELETE /api/watcher:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
