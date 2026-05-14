-- Tabla para cargadores ficticios controlados via Telegram
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS test_connectors (
  id SERIAL PRIMARY KEY,
  connector_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'FREE',
  status_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar los dos cargadores ficticios iniciales
INSERT INTO test_connectors (connector_id, status, status_updated_at)
VALUES 
  ('003657', 'FREE', NOW()),
  ('003658', 'FREE', NOW())
ON CONFLICT (connector_id) DO NOTHING;

-- Habilitar RLS
ALTER TABLE test_connectors ENABLE ROW LEVEL SECURITY;

-- Politica para permitir todas las operaciones (para el bot)
CREATE POLICY "Allow all operations" ON test_connectors
  FOR ALL USING (true) WITH CHECK (true);
