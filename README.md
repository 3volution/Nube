# Guardian 24/7 - Sistema de Monitoreo de Cargadores Eléctricos

Sistema de monitoreo 24/7 de cargadores eléctricos que consulta Electromaps cada minuto, detecta cambios de estado (Ocupado → Libre) y envía notificaciones instantáneas por Telegram.

## Características

✅ Monitoreo automático cada 1 minuto de 6 estaciones de carga  
✅ Detección instantánea de conectores que pasan de Ocupado a Libre  
✅ Notificaciones por Telegram en tiempo real  
✅ Dashboard web con estado de todos los conectores  
✅ Logs detallados filtrados por tipo (ERROR, CAMBIO, SUCCESS, INFO)  
✅ Persistencia en Supabase (PostgreSQL)  
✅ Validación de seguridad con CRON_SECRET  
✅ Auto-refresh cada 30 segundos en el dashboard  

## Stack Tecnológico

- **Backend**: Node.js + Vercel Serverless Functions
- **API Monitoring**: Electromaps API
- **Notificaciones**: Telegram Bot API
- **Database**: Supabase (PostgreSQL)
- **Frontend**: Next.js 15 + React + Tailwind CSS
- **Hosting**: Vercel + Supabase
- **Cron Jobs**: cron-job.org

## Instalación

### 1. Prerrequisitos

- Cuenta en Vercel
- Cuenta en Supabase
- Bot de Telegram creado (vía BotFather)
- Credenciales de Electromaps

### 2. Crear las Tablas en Supabase

Ve a tu proyecto de Supabase y ejecuta en SQL Editor:

```sql
CREATE TABLE charger_state (
  station_id TEXT PRIMARY KEY,
  station_name TEXT NOT NULL,
  state JSONB NOT NULL,
  last_check TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  message TEXT,
  level TEXT DEFAULT 'INFO',
  station_id TEXT
);

CREATE INDEX idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX idx_logs_station ON logs(station_id);
```

### 3. Variables de Entorno en Vercel

Configura en **Settings → Environment Variables**:

```
ELECTROMAPS_USER=tu_usuario@electromaps.com
ELECTROMAPS_PASS=tu_contraseña
TELEGRAM_BOT_TOKEN=123456:ABCdef...
TELEGRAM_CHAT_ID=987654321
SUPABASE_URL=https://tuproject.supabase.co/rest/v1/
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
CRON_SECRET=tu_secreto_aleatorio
```

### 4. Configurar el Cron Job

En [cron-job.org](https://cron-job.org):

1. Crear nuevo cron job
2. URL: `https://tudominio.vercel.app/api/monitor?token=TU_CRON_SECRET`
3. Schedule: `*/1 * * * *` (cada 1 minuto)
4. Guardar

### 5. Desplegar en Vercel

```bash
git push origin main
```

O conecta tu repositorio de GitHub en Vercel dashboard.

## URLs del Sistema

- **Dashboard de Monitoreo**: `https://tudominio.vercel.app/monitor`
- **API de Estaciones**: `https://tudominio.vercel.app/app/api/stations`
- **API de Logs**: `https://tudominio.vercel.app/app/api/logs`
- **API de Monitor (Cron)**: `https://tudominio.vercel.app/api/monitor?token=CRON_SECRET`

## Estructura del Proyecto

```
.
├── api/
│   └── monitor.js           # Función serverless de monitoreo
├── app/
│   ├── api/
│   │   ├── logs/route.js    # API para obtener logs
│   │   └── stations/route.js # API para obtener estado de estaciones
│   ├── monitor/
│   │   └── page.tsx          # Dashboard de monitoreo
│   ├── layout.tsx
│   └── globals.css
├── vercel.json              # Configuración de Vercel
├── .env.example             # Variables de entorno (ejemplo)
└── README.md
```

## Flujo de Funcionamiento

```
cron-job.org (cada 1 min)
    ↓
/api/monitor (Vercel Function)
    ↓
Electromaps API (Consulta estado)
    ↓
Comparar con estado anterior (Supabase)
    ↓
Si cambio detectado → Enviar Telegram + Guardar en BD
    ↓
Guardar logs en Supabase
    ↓
Dashboard obtiene datos de APIs → Muestra en tiempo real
```

## Estaciones Monitoreadas

1. **Estacion Bus** (828537) - Av. de la Libertad, Mérida
2. **Avda. Roma** (828524) - Avda. de Roma, Mérida
3. **Plaza Xirgu** (828523) - Pl. Margarita Xirgu, Mérida
4. **Calle Almendralejo (1)** (828534) - C. Almendralejo, Mérida
5. **Calle Almendralejo (2)** (828535) - C. Almendralejo, Mérida
6. **Avda. del Prado** (828538) - Avda. del Prado, Mérida

## Logs del Sistema

El dashboard muestra logs categorizados:

- **ERROR**: Errores en la ejecución (Electromaps, Telegram, BD)
- **CAMBIO**: Cambios detectados en conectores
- **SUCCESS**: Consultas exitosas
- **INFO**: Información general del sistema

## Troubleshooting

### El cron job no se ejecuta
- Verifica que `CRON_SECRET` en cron-job.org coincida con la variable de entorno
- Revisa los logs de Vercel en el dashboard

### No llegan notificaciones de Telegram
- Verifica que el `TELEGRAM_BOT_TOKEN` sea correcto
- Comprueba que el `TELEGRAM_CHAT_ID` sea válido
- El bot debe estar iniciado en el chat (escribe `/start`)

### Dashboard no muestra datos
- Confirma que las tablas en Supabase están creadas
- Verifica que `SUPABASE_URL` y `SUPABASE_ANON_KEY` sean correctos
- Revisa la consola del navegador para errores

## Fases Futuras

- Fase 2: Agregar más estaciones (hasta 10 totales)
- Fase 3: Historial avanzado y estadísticas
- Fase 4: Alertas personalizables por conector
- Fase 5: Integración con otros servicios (Slack, Discord, etc)

## Licencia

Privado - Guardian 24/7
# Force redeploy V10.0
