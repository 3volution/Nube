import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// PATCH: Detener monitoreo
export async function PATCH(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { action } = body; // 'stop' o 'found'

    if (!id) {
      return Response.json({ error: 'Missing monitoring ID' }, { status: 400 });
    }

    const updateData = {
      is_active: false,
      end_time: new Date().toISOString()
    };

    if (action === 'found') {
      updateData.found_available = true;
      updateData.found_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('charger_monitoring')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[v0] Error updating monitoring:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    console.log('[v0] Monitoreo detenido:', id);
    return Response.json(data, { status: 200 });
  } catch (error) {
    console.error('[v0] Error in stop monitoring:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Eliminar monitoreo
export async function DELETE(request, { params }) {
  try {
    const { id } = params;

    if (!id) {
      return Response.json({ error: 'Missing monitoring ID' }, { status: 400 });
    }

    const { error } = await supabase
      .from('charger_monitoring')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[v0] Error deleting monitoring:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    console.log('[v0] Monitoreo eliminado:', id);
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[v0] Error in delete monitoring:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
