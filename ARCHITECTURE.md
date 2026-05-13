# Arquitectura - Guardian 24/7

## Flujo de Datos Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                     SCHEDULER (cron-job.org)                   │
│                   Executa cada 1 minuto                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │  VERCEL SERVERLESS FUNCTION            │
        │  /api/monitor.js                       │
        │  (Máximo 10 segundos)                  │
        └────┬─────────────┬──────────────┬──────┘
             │             │              │
             ▼             ▼              ▼
        ┌────────┐    ┌─────────┐   ┌──────────┐
        │Electro │    │Supabase │   │ Telegram │
        │ maps   │    │  Logs   │   │   Bot    │
        │  API   │    │         │   │          │
        └────┬───┘    └────┬────┘   └────┬─────┘
             │             │             │
             │             │    Notificación
             │             │    si cambio
             │             │    detectado
             ▼             ▼             ▼
        ┌─────────────────────────────────────┐
        │     Tabla: charger_state            │
        │     Tabla: logs                     │
        │     (Supabase PostgreSQL)           │
        └─────────────────────────────────────┘
             │
             ▼
    ┌────────────────────────┐
    │  DASHBOARD NEXT.JS     │
    │  /monitor (página web) │
    │                        │
    │ Actualiza cada 30s     │
    └────────────────────────┘
             │
             ▼
        [Usuario Browser]
```

---

## Componentes

### 1. Scheduler Externo (cron-job.org)
- **Rol**: Dispara la función cada 1 minuto
- **Request**: `GET /api/monitor?token=CRON_SECRET`
- **Uptime**: 24/7
- **Costo**: Gratuito

### 2. API Serverless (Vercel)
```
Vercel Function: /api/monitor.js
├── Entrada: GET /api/monitor?token=CRON_SECRET
├── Validación: Verifica token
├── Lógica:
│   ├── 1. Obtener token Electromaps (Cognito AWS)
│   ├── 2. Para cada estación:
│   │   ├── Consultar estado actual (Electromaps API)
│   │   ├── Comparar con anterior (Supabase)
│   │   ├── Detectar cambios (OCCUPIED → FREE)
│   │   ├── Enviar notificación Telegram
│   │   └── Guardar nuevo estado
│   └── 3. Registrar logs de todo el proceso
└── Salida: JSON con resultados
```

**Duración**: < 10 segundos (límite Vercel)
**Memory**: 128MB default
**Costo**: Gratuito (tier Vercel)

### 3. Base de Datos (Supabase PostgreSQL)
```
Tablas:
├── charger_state (estado actual)
│   ├── station_id (PK)
│   ├── station_name
│   ├── state (JSONB con conectores)
│   └── last_check (timestamp)
│
└── logs (histórico)
    ├── id (PK)
    ├── timestamp
    ├── level (INFO, ERROR, CAMBIO, SUCCESS)
    ├── message
    └── station_id (FK)
```

**Almacenamiento**: 500MB gratuito (actualmente <10MB)
**Costo**: Gratuito tier Supabase

### 4. Notificaciones (Telegram Bot)
- **Bot Token**: Configurado via env var
- **Chat ID**: Donde recibir alertas
- **Mensajes**: Automáticos cuando hay cambios
- **Costo**: Gratuito

### 5. APIs REST (Next.js Routes)
```
GET /app/api/stations
├── Entrada: ninguna
├── Lógica: Lee tabla charger_state de Supabase
└── Salida: JSON con estado de todas las estaciones

GET /app/api/logs
├── Entrada: ?limit=50&level=ERROR (opcional)
├── Lógica: Lee tabla logs de Supabase
└── Salida: JSON con historial de eventos
```

### 6. Dashboard (Next.js Frontend)
```
/app/monitor/page.tsx
├── Componentes:
│   ├── Header con título
│   ├── Controles (Actualizar, Auto-refresh)
│   ├── Grid de estaciones
│   │   ├── Nombre y dirección
│   │   ├── Conectores (verde=libre, rojo=ocupado)
│   │   └── Última actualización
│   └── Tabla de logs
│       ├── Timestamp
│       ├── Nivel (con iconos)
│       ├── Estación
│       └── Mensaje
└── Actualización: Auto-refresco cada 30 segundos
```

**Costo**: Gratuito (Next.js en Vercel)

---

## Flujo de Detección de Cambios

```
┌─────────────────────────────────────────┐
│ 1. Consultar Electromaps API            │
│    para cada estación                   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│ 2. Obtener estado anterior de Supabase  │
│    charger_state table                   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│ 3. Para cada conector:                   │
│    Comparar status anterior vs actual    │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        ▼             ▼
    NO CAMBIO    ¿OCCUPIED→FREE?
        │             │
        ▼             ▼
    Continuar    CAMBIO DETECTADO
        │             │
        │             ├─▶ 1. Enviar Telegram
        │             │   2. Guardar en logs
        │             │      (level=CAMBIO)
        │             │
        └─────┬───────┘
              ▼
    ┌──────────────────────────────┐
    │ 4. Guardar estado actual en  │
    │    charger_state (upsert)    │
    └──────────────────────────────┘
              │
              ▼
    ┌──────────────────────────────┐
    │ 5. Guardar resultado en logs │
    │    (level=SUCCESS)           │
    └──────────────────────────────┘
```

---

## Configuración de Estaciones

```javascript
// api/monitor.js - Array ESTACIONES

const ESTACIONES = [
  {
    nombre: "Estacion Bus",      // Nombre legible
    id: 828537,                   // ID de Electromaps
    direccion: "Av. de la Libertad, Mérida"  // Para notificaciones
  },
  // ... más estaciones
];
```

**Cómo agregar una estación:**
1. Abre `/api/monitor.js`
2. Agrega elemento al array ESTACIONES
3. Despliega: `vercel deploy --prod`

---

## Variables de Entorno

```
ELECTROMAPS_USER       → Usuario Electromaps
ELECTROMAPS_PASS       → Contraseña Electromaps
TELEGRAM_BOT_TOKEN     → Token del Bot (BotFather)
TELEGRAM_CHAT_ID       → ID del chat para alertas
SUPABASE_URL           → https://xxx.supabase.co/rest/v1/
SUPABASE_ANON_KEY      → sb_publishable_xxxxx
CRON_SECRET            → Token secreto para validar cron
```

**Seguridad:**
- ✓ Almacenadas en Vercel (encriptadas)
- ✓ No visibles en el código
- ✓ Validadas en cada request

---

## Tiempos de Respuesta

```
Cron dispara
    │
    ├─ Obtener token Electromaps: ~500ms
    │
    ├─ Por cada estación:
    │   ├─ Consultar API: ~300ms
    │   ├─ Leer Supabase: ~100ms
    │   ├─ Guardar en Supabase: ~100ms
    │   └─ Si cambio: Telegram: ~200ms
    │
    └─ Total: ~2-3 segundos (6 estaciones)

Límite Vercel: 10 segundos (OK con margen)
```

---

## Alta Disponibilidad

- **Scheduler**: cron-job.org (múltiples data centers)
- **Backend**: Vercel (global, auto-scaling)
- **BD**: Supabase (replicación, backups automáticos)
- **Notificaciones**: Telegram (infraestructura mundial)

**SLA estimado**: 99.9% uptime

---

## Costos Estimados (Mensual)

| Componente | Costo |
|-----------|-------|
| Vercel Serverless | Gratuito* |
| Supabase PostgreSQL | Gratuito* |
| Telegram Bot | Gratuito |
| cron-job.org | Gratuito |
| **Total** | **Gratuito** |

*Dentro de limits gratuitos. Tier actual usa < 5% de límites.

---

## Escalabilidad

Para agregar más estaciones/conectores:

| Métrica | Actual | Límite Gratuito | Acción |
|---------|--------|-----------------|--------|
| Estaciones | 6 | Ilimitado | - |
| Conectores | ~18 | Ilimitado | - |
| Logs/día | ~1440 | Ilimitado | - |
| BD Storage | <10MB | 500MB | Mantén <100MB |
| Function Calls | ~1440 | Ilimitado | - |

**Escalar:**
1. Agrega hasta 100+ estaciones sin problemas
2. Si superas 500MB BD: Limpia logs antiguos
3. Si necesitas redundancia: Agrega otra región

---

## Diagramas de Sequencia

### Ejecución Normal (cada minuto)

```
cron-job.org
    │
    ▼
/api/monitor?token=xxx
    │
    ├─▶ Validar token
    │   
    ├─▶ Login Electromaps (Cognito)
    │   
    ├─▶ Para cada estación [looping]:
    │   │
    │   ├─▶ GET Electromaps /locations/{id}
    │   │   Respuesta: [{id, visualRef, status}]
    │   │
    │   ├─▶ GET Supabase charger_state
    │   │   Respuesta: [{...state}]
    │   │
    │   ├─▶ Comparar statuses
    │   │   │
    │   │   └─▶ Si OCCUPIED → FREE:
    │   │       │
    │   │       ├─▶ POST Telegram Bot
    │   │       │   "Conector X liberado"
    │   │       │
    │   │       └─▶ INSERT logs
    │   │           (level=CAMBIO)
    │   │
    │   ├─▶ POST Supabase charger_state
    │   │   (Upsert: actualizar o crear)
    │   │
    │   └─▶ INSERT logs (level=SUCCESS)
    │
    └─▶ Response: {success, notifications, cambios}
```

### Acceso al Dashboard

```
Usuario abre browser
    │
    ▼
https://app.vercel.app/monitor
    │
    ├─▶ GET /app/api/stations
    │   ├─ Query Supabase charger_state
    │   └─ Respuesta: [{station_id, name, connectors}]
    │
    ├─▶ GET /app/api/logs?limit=100
    │   ├─ Query Supabase logs
    │   └─ Respuesta: [{timestamp, level, message}]
    │
    └─▶ Renderizar componente React
        ├─ Grid de estaciones
        └─ Tabla de logs
        
Auto-refresco cada 30 segundos
```

---

## Documentación de Referencia

- [README.md](./README.md) - Guía general
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Cómo desplegar
- [CRON_SETUP.md](./CRON_SETUP.md) - Configurar cron job
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Esquema Supabase
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Este documento
