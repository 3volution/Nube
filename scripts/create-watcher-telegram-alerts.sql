-- HackerCharger / Telegram Toyota CHR (5 avisos, pausa de 1 segundo).
-- Migracion aditiva: no modifica datos ni tablas historicas de Twilio.
CREATE TABLE IF NOT EXISTS public.watcher_telegram_alerts (
  watcher_id UUID PRIMARY KEY REFERENCES public.active_watchers(id) ON DELETE CASCADE,
  station_id TEXT NOT NULL,
  station_name TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'failed', 'completed')),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count BETWEEN 0 AND 5),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_watcher_telegram_alerts_status_claim
  ON public.watcher_telegram_alerts(status, claimed_at);

ALTER TABLE public.watcher_telegram_alerts ENABLE ROW LEVEL SECURITY;
-- Sin politicas para anon/authenticated: acceso exclusivamente desde backend con service role.
COMMENT ON TABLE public.watcher_telegram_alerts IS
  'Cinco mensajes de Telegram Toyota CHR con 1 segundo entre mensajes y desactivacion de watcher al completar.';
