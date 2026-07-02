import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper function para crear cliente Supabase
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }

  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();

    // Obtener todos los registros ordenados por timestamp descendente
    const { data, error } = await supabase
      .from('access_logs')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Supabase error en GET:', error.message);
      return NextResponse.json(
        { logs: [] },
        { status: 200 } // Devolver vacío en lugar de error
      );
    }

    return NextResponse.json({ logs: data || [] });
  } catch (err) {
    console.error('Error en GET /api/access-log:', err.message);
    return NextResponse.json(
      { logs: [] },
      { status: 200 } // Devolver vacío en lugar de error
    );
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { password, status } = body;

    // Insertar registro en Supabase
    const { data, error } = await supabase
      .from('access_logs')
      .insert([
        {
          password: password || '',
          status: status || 'failed',
          date: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
          timestamp: new Date().toISOString()
        }
      ])
      .select();

    if (error) {
      console.error('Supabase error en POST:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error en POST /api/access-log:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
