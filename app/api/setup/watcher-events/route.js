import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/setup/watcher-events?secret=CRON_SECRET
 * Crea la tabla watcher_call_events si no existe.
 * Ejecutar una sola vez desde el navegador.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('secret') !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sql = `
    CREATE TABLE IF NOT EXISTS watcher_call_events (
      id              BIGSERIAL PRIMARY KEY,
      watcher_id      UUID,
      station_name    TEXT NOT NULL,
      station_id      TEXT NOT NULL,
      connector_id    TEXT,
      previous_status TEXT,
      current_status  TEXT,
      called_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      acknowledged    BOOLEAN NOT NULL DEFAULT false,
      acknowledged_at TIMESTAMPTZ
    );

    ALTER TABLE watcher_call_events ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'watcher_call_events' AND policyname = 'anon_select_call_events'
      ) THEN
        CREATE POLICY anon_select_call_events ON watcher_call_events FOR SELECT TO anon USING (true);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'watcher_call_events' AND policyname = 'anon_insert_call_events'
      ) THEN
        CREATE POLICY anon_insert_call_events ON watcher_call_events FOR INSERT TO anon WITH CHECK (true);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'watcher_call_events' AND policyname = 'anon_update_call_events'
      ) THEN
        CREATE POLICY anon_update_call_events ON watcher_call_events FOR UPDATE TO anon USING (true) WITH CHECK (true);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'watcher_call_events' AND policyname = 'service_role_all'
      ) THEN
        CREATE POLICY service_role_all ON watcher_call_events FOR ALL TO service_role USING (true) WITH CHECK (true);
      END IF;
    END
    $$;
  `;

  const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: { message: 'rpc no disponible' } }));

  if (error) {
    // Si rpc no está disponible, intentar directamente con pg
    return Response.json({
      error: 'No se puede crear la tabla automáticamente. Ejecuta este SQL en Supabase SQL Editor:',
      sql: sql.trim()
    }, { status: 422 });
  }

  return Response.json({ success: true, message: 'Tabla watcher_call_events creada correctamente' });
}
