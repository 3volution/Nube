import { createClient } from '@supabase/supabase-js';

// Helper function para crear cliente Supabase
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }
  
  return createClient(url, key);
}

// POST: Iniciar monitoreo de una estación
export async function POST(request) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { station_id, station_name, phone_number } = body;

    // Validaciones básicas
    if (!station_id || !station_name || !phone_number) {
      return Response.json(
        { error: 'Missing required fields: station_id, station_name, phone_number' },
        { status: 400 }
      );
    }

    // Verificar si ya hay monitoreo activo para esta estación
    const { data: existingMonitoring } = await supabase
      .from('charger_monitoring')
      .select('id')
      .eq('station_id', station_id)
      .eq('is_active', true)
      .single();

    if (existingMonitoring) {
      return Response.json(
        { error: 'Monitoring already active for this station' },
        { status: 409 }
      );
    }

    // Crear nuevo monitoreo
    const { data, error } = await supabase
      .from('charger_monitoring')
      .insert({
        station_id,
        station_name,
        phone_number,
        is_active: true,
        found_available: false
      })
      .select()
      .single();

    if (error) {
      console.error('[v0] Error creating monitoring:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    console.log('[v0] Monitoreo iniciado:', data.id);
    return Response.json({ success: true, monitoring: data }, { status: 201 });
  } catch (error) {
    console.error('[v0] Error in POST /api/monitoring:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// GET: Obtener monitoreos activos
export async function GET(request) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('station_id');

    let query = supabase
      .from('charger_monitoring')
      .select('*')
      .eq('is_active', true);

    if (stationId) {
      query = query.eq('station_id', stationId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[v0] Error fetching monitoring:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, monitorings: data }, { status: 200 });
  } catch (error) {
    console.error('[v0] Error in GET /api/monitoring:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
