-- Tabla para almacenar cambios de estado de conectores
CREATE TABLE IF NOT EXISTS connector_state_changes (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  fecha TEXT,
  dia TEXT,
  hora TEXT,
  connector_id TEXT NOT NULL,
  station_id TEXT,
  station_name TEXT,
  estado_anterior TEXT,
  estado_nuevo TEXT,
  tiempo_en_estado_anterior_segundos INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE connector_state_changes ENABLE ROW LEVEL SECURITY;

-- Politica para permitir todas las operaciones
CREATE POLICY "Allow all operations on connector_state_changes" ON connector_state_changes
  FOR ALL USING (true) WITH CHECK (true);

-- Indice para busquedas rapidas por timestamp
CREATE INDEX IF NOT EXISTS idx_connector_state_changes_timestamp 
  ON connector_state_changes(timestamp DESC);
