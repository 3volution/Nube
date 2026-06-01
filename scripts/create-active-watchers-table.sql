-- Script SQL para crear la tabla active_watchers en Supabase
-- Ejecutar este script en el SQL Editor de Supabase Dashboard

-- Tabla para vigilancias activas de cargadores
CREATE TABLE IF NOT EXISTS active_watchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id TEXT NOT NULL UNIQUE,
  station_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
  last_connector_states JSONB NOT NULL,
  retry_count INTEGER DEFAULT 0
);

-- Indices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_active_watchers_status ON active_watchers(status);
CREATE INDEX IF NOT EXISTS idx_active_watchers_station_id ON active_watchers(station_id);

-- Comentarios de documentación
COMMENT ON TABLE active_watchers IS 'Vigilancias activas para detectar cuando un cargador pasa de OCCUPIED a FREE';
COMMENT ON COLUMN active_watchers.station_id IS 'ID de la estacion de Electromaps';
COMMENT ON COLUMN active_watchers.station_name IS 'Nombre legible de la estacion';
COMMENT ON COLUMN active_watchers.status IS 'active=vigilando, completed=llamada realizada, cancelled=cancelado manualmente, failed=reintentos agotados';
COMMENT ON COLUMN active_watchers.last_connector_states IS 'Snapshot JSON del estado de los conectores en la ultima consulta';
COMMENT ON COLUMN active_watchers.retry_count IS 'Numero de intentos fallidos de llamada Twilio. Maximo 5. Al llegar a 5 el status pasa a failed.';
