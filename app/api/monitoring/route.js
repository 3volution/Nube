import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POST: Iniciar monitoreo de una estación
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      station_id,
      station_name,
      phone_number,
      telegram_chat_id,
      notification_methods = ['telegram', 'sms', 'twilio'],
      duration_minutes = 120
    } = body;

    // Validar datos requeridos
    if (!station_id || !station_name || !phone_number) {
      return Response.json(
        { error: 'Missing required fields: station_id, station_name, phone_number' },
        { status: 400 }
      );
    }

    // Verificar si ya hay un monitoreo activo para esta estación
    const { data: existing } = await supabase
      .from('charger_monitoring')
      .select('id')
      .eq('station_id', station_id)
      .eq('is_active', true)
      .single();

    if (existing) {
      return Response.json(
        { error: 'Monitoring already active for this station', existingId: existing.id },
        { status: 409 }
      );
    }

    // Crear nuevo registro de monitoreo
    const endTime = new Date();
    endTime.setMinutes(endTime.getMinutes() + duration_minutes);

    const { data, error } = await supabase
      .from('charger_monitoring')
      .insert([
        {
          station_id,
          station_name,
          phone_number,
          telegram_chat_id: telegram_chat_id || null,
          notification_methods,
          duration_minutes,
          is_active: true,
          end_time: endTime.toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('[v0] Error creating monitoring:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    console.log('[v0] Monitoreo iniciado:', data.id);
    return Response.json(data, { status: 201 });
  } catch (error) {
    console.error('[v0] Error in start monitoring:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// GET: Obtener monitoreos activos
export async function GET(request) {
  try {
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

    return Response.json(data, { status: 200 });
  } catch (error) {
    console.error('[v0] Error in get monitoring:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
