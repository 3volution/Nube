import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseClient() {
  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();

    // Obtener monitoreos activos (status = 'active')
    const { data: activeMonitorings, error } = await supabase
      .from('charger_monitoring')
      .select('id, station_id, status')
      .eq('status', 'active');

    if (error) {
      console.error('[v0] Error fetching active monitorings:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ activeMonitorings });
  } catch (err) {
    console.error('[v0] Error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
