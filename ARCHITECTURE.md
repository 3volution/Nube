# Arquitectura V12.0 - Guardian 24/7

## Motor Oficial: api/monitor.js

V12.0 consolida la arquitectura con un unico motor de deteccion automatica.

```
MOTOR PRINCIPAL (api/monitor.js)
├── Trigger: Cron externo cada minuto
├── Fuente: Electromaps API (datos reales)
├── Deteccion: OCCUPIED → AVAILABLE
├── Notificacion primaria: Telegram
├── Notificacion secundaria: Twilio (via watcher/check)
└── Persistencia: Supabase (charger_state, connector_state_changes)
```

## Flujo de Datos Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                     SCHEDULER (cron-job.org)                   │
│                   Ejecuta cada 1 minuto                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │  VERCEL SERVERLESS FUNCTION            │
        │  /api/monitor.js                       │
        └────┬─────────────┬──────────────┬──────┘
             │             │              │
             ▼             ▼              ▼
        ┌────────┐    ┌─────────┐   ┌──────────┐
        │Electro │    │Supabase │   │ Telegram │
        │ maps   │    │  BD     │   │   Bot    │
        │  API   │    │         │   │          │
        └────────┘    └─────────┘   └──────────┘
```

## Endpoints de Produccion

| Endpoint | Metodo | Proposito |
|----------|--------|-----------|
| `/api/monitor` | GET | Motor principal - deteccion automatica |
| `/api/stations` | GET | Estado actual de estaciones |
| `/api/logs` | GET | Historial de eventos |
| `/api/state-changes` | GET | Cambios de estado registrados |
| `/api/status` | GET | Health check |
| `/api/monitoring` | GET/POST | Gestion de monitoreo |
| `/api/monitoring/active` | GET | Monitoreos activos |
| `/api/monitoring/[id]` | GET/DELETE | Monitoreo especifico |
| `/api/telegram-webhook` | POST | Control manual Telegram |
| `/api/twilio/test-call` | POST | Prueba de llamada Twilio |
| `/api/watcher` | GET/POST/DELETE | Gestion de vigilancias |
| `/api/watcher/check` | GET | Check de vigilancias (cron) |

## Canales de Notificacion

### Telegram (Primario)
- Notificaciones automaticas via api/monitor.js
- Formato: "Conector X liberado en Estacion Y"
- Control manual via comandos /ocupar, /liberar, /estado

### Twilio (Secundario)
- Llamadas telefonicas via watcher/check
- Activado manualmente al crear vigilancia
- Formato: Mensaje de voz TwiML

## Base de Datos (Supabase)

```
Tablas principales:
├── charger_state        Estado actual por estacion
├── connector_state_changes   Historial de transiciones
├── active_watchers      Vigilancias activas (Twilio)
├── logs                 Registro de eventos
└── test_connectors      Datos de prueba (manual)
```

## Variables de Entorno

```
# Electromaps
ELECTROMAPS_USER
ELECTROMAPS_PASS

# Telegram
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

# Twilio
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
TWILIO_CALL_RECIPIENT

# Supabase
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Seguridad
CRON_SECRET
```

## Estaciones Monitoreadas

Configuradas en api/monitor.js array ESTACIONES:

| ID | Nombre | Direccion |
|----|--------|-----------|
| 828537 | Estacion Bus | Av. de la Libertad, Merida |
| 833929 | Plaza Xirgu | Pl. Margarita Xirgu, Merida |
| 828434 | Calle Almendralejo (1) | C. Almendralejo, Merida |
| 828433 | Calle Almendralejo (2) | C. Almendralejo, Merida |
| 840019 | Subestacion Merida | Merida |
| 828536 | Hospital Merida | Merida |

## Costos (Mensual)

| Componente | Costo |
|-----------|-------|
| Vercel Serverless | Gratuito |
| Supabase PostgreSQL | Gratuito |
| Telegram Bot | Gratuito |
| Twilio | Por uso (~0.02/llamada) |
| cron-job.org | Gratuito |
