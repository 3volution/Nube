-- Crear tabla para almacenar sesiones de monitoreo de cargadores
CREATE TABLE IF NOT EXISTS charger_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id TEXT NOT NULL,
  station_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  telegram_chat_id TEXT,
  notification_methods TEXT[] DEFAULT ARRAY['telegram', 'sms', 'twilio'],
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 120,
  is_active BOOLEAN DEFAULT true,
  found_available BOOLEAN DEFAULT false,
  found_at TIMESTAMPTZ,
  alerts_sent JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_charger_monitoring_active 
  ON charger_monitoring(is_active, station_id);

CREATE INDEX IF NOT EXISTS idx_charger_monitoring_station 
  ON charger_monitoring(station_id);

CREATE INDEX IF NOT EXISTS idx_charger_monitoring_created_at 
  ON charger_monitoring(created_at DESC);

-- Crear función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_charger_monitoring_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para actualizar updated_at
DROP TRIGGER IF NOT EXISTS trigger_charger_monitoring_updated_at ON charger_monitoring;

CREATE TRIGGER trigger_charger_monitoring_updated_at
  BEFORE UPDATE ON charger_monitoring
  FOR EACH ROW
  EXECUTE FUNCTION update_charger_monitoring_updated_at();

-- Tabla de registro de alertas para auditoría
CREATE TABLE IF NOT EXISTS monitoring_alerts_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoring_id UUID REFERENCES charger_monitoring(id) ON DELETE CASCADE,
  station_id TEXT NOT NULL,
  alert_method TEXT NOT NULL, -- 'telegram', 'sms', 'twilio'
  alert_status TEXT NOT NULL, -- 'success', 'failed'
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_log_monitoring_id 
  ON monitoring_alerts_log(monitoring_id);

CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_log_sent_at 
  ON monitoring_alerts_log(sent_at DESC);
