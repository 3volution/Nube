# Developer Onboarding - HackerCharger V12.0

## Resumen Ejecutivo

**HackerCharger** es un sistema de monitoreo 24/7 de estaciones de carga de vehículos eléctricos en Mérida. Detecta automáticamente cuando se liberan conectores ocupados y notifica por Telegram y Twilio.

- **Stack:** Next.js 16 + Node.js + Supabase + Twilio + Telegram Bot
- **Despliegue:** Vercel (serverless)
- **Estado:** V12.0 (Consolidado)
- **Versión:** 5a96d7a (en Production)

---

## Flujo Principal (Lo que Debes Entender)

### 1. Motor de Detección (api/monitor.js)
```
CADA MINUTO:
  1. Cron externo invoca GET /api/monitor?token=CRON_SECRET
  2. Para cada estación configurada:
     - Consulta Electromaps API (credenciales en .env)
     - Obtiene estado actual de conectores (OCCUPIED, AVAILABLE, etc)
     - Compara con estado anterior guardado en Supabase
     - SI cambió OCCUPIED → AVAILABLE:
       ├─ Envía mensaje a Telegram Bot
       └─ Registra el cambio en tabla connector_state_changes
     - Guarda nuevo estado en charger_state
```

### 2. Sistema de Vigilancias (Watcher)
Usuarios pueden crear vigilancias manuales para recibir **llamadas Twilio** cuando se libera un conector:

```
USUARIO CREA VIGILANCIA EN UI:
  1. Ingresa:
     - Estación a vigilar
     - Número de teléfono Twilio ← PROBLEMA ACTUAL
  2. POST /api/watcher con datos
  3. Se guarda en Supabase table active_watchers
  
CADA MINUTO (vía watcher/check):
  1. Consulta active_watchers (vigilancias activas)
  2. Para cada vigilancia:
     - Checkea si su estación tiene cambios OCCUPIED → AVAILABLE
     - SI es así: Llama a sendNotification()
     - Twilio hace llamada al número guardado
```

---

## Problema Actual: Twilio Ignorando el Número del Usuario

**Identificado:** El número de teléfono ingresado en el formulario NO se almacena ni se utiliza.

### Trazabilidad del Problema:

```
WatcherModal.tsx (Formulario)
  ├─ Input: twilioPhone (usuario ingresa +34XXXXXX)
  └─ Estado: twilioPhone capturado correctamente
  
handleStartWatcher() (onClick enviar)
  ├─ POST /api/watcher
  └─ Body: {station_id, station_name} ← ❌ twilioPhone NO se envía
  
/api/watcher route.js (Backend)
  ├─ Recibe solo station_id, station_name
  └─ INSERT active_watchers {station_id, station_name, ...}
                            ↑
                        ❌ SIN campo phone
  
Supabase active_watchers tabla
  ├─ Campos: station_id, station_name, last_connector_states, status
  └─ ❌ NO TIENE columna para teléfono
  
/api/watcher/check route.js (Cron cada minuto)
  ├─ Detecta liberación
  ├─ Llama: sendNotification(process.env.TWILIO_CALL_RECIPIENT, ...)
  └─ ❌ SIEMPRE usa la env var global
          (ignora completamente el número del usuario)
```

### Resultado Actual:
- ✅ Telegram: Funciona correctamente (sin depender de vigilancias)
- ❌ Twilio: Siempre llama al número de la env var (TWILIO_CALL_RECIPIENT)
- ❌ El número ingresado por el usuario se ignora completamente

---

## Estructura de Directorios Importante

```
/vercel/share/v0-project/
├── api/                          # Scripts de cron/monitor (Node.js puro)
│   ├── monitor.js                ← MOTOR PRINCIPAL
│   └── electromaps.js            ← Cliente Electromaps
│
├── app/
│   ├── api/                       # Next.js API routes
│   │   ├── watcher/
│   │   │   ├── route.js           ← Crear/eliminar vigilancias (POST/DELETE)
│   │   │   └── check/
│   │   │       └── route.js       ← Chequear vigilancias (llamadas Twilio) ← PROBLEMA
│   │   ├── twilio/
│   │   │   └── test-call/
│   │   │       └── route.js       ← Prueba de llamada Twilio
│   │   ├── telegram-webhook/
│   │   │   └── route.js           ← Webhook manual Telegram
│   │   ├── monitoring/            ← Dashboard API
│   │   ├── stations/              ← Estado actual estaciones
│   │   └── logs/                  ← Historial eventos
│   │
│   ├── components/
│   │   ├── WatcherModal.tsx       ← Formulario crear vigilancia ← AQUI CAPTURA NUMERO
│   │   └── ui/                    ← Componentes Radix/shadcn
│   │
│   ├── services/
│   │   └── notification-service.js ← sendNotification() - ENVÍA A TWILIO
│   │
│   ├── config/
│   │   ├── version.ts             ← APP_VERSION = 'V12.0'
│   │   └── supabase.ts            ← Cliente Supabase
│   │
│   ├── layout.tsx                 ← Root layout
│   └── page.tsx                   ← Dashboard principal
│
├── DATABASE_SCHEMA.md             ← Estructura Supabase (léelo)
├── ARCHITECTURE.md                ← Diagrama completo
└── .env.local                     ← Variables de entorno
```

---

## Tablas Supabase Principales

### 1. **charger_state** (Estado Actual)
```
id, station_id, station_name, connector_id, status, last_status_change
```
Guarda el estado más reciente de cada conector.

### 2. **connector_state_changes** (Historial)
```
id, connector_id, station_id, estado_anterior, estado_nuevo, 
detected_at, source, timestamp
```
Registro completo de transiciones de estado (1000+ registros).

### 3. **active_watchers** (Vigilancias Activas) ← AQUI ESTÁ EL PROBLEMA
```
id, station_id, station_name, last_connector_states, 
status, retry_count, created_at, updated_at
```
❌ **NO TIENE campo teléfono** - Almacena vigilancias del usuario.

### 4. **logs** (Eventos)
```
id, event_type, message, timestamp, data
```
Registro general de eventos del sistema.

---

## Variables de Entorno Clave

```
# Electromaps (fuente de datos real)
ELECTROMAPS_USER=xxx
ELECTROMAPS_PASS=xxx

# Telegram (notificaciones automáticas)
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=xxx

# Twilio (llamadas telefónicas)
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+34xxx (desde dónde se llama)
TWILIO_CALL_RECIPIENT=+34xxx (número fijo donde llamar) ← AQUI EL PROBLEMA

# Supabase
SUPABASE_URL=xxx
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Seguridad
CRON_SECRET=token-para-validar-cron
```

---

## Cómo Arreglarlo: Twilio Multi-Usuario

### Cambios Necesarios:

1. **WatcherModal.tsx** - Enviar el número al backend
2. **app/api/watcher/route.js** - Guardar el número en Supabase
3. **active_watchers tabla (Supabase)** - Agregar columna `phone_number`
4. **app/services/notification-service.js** - Usar el número guardado, no la env var

---

## Flujos de Código Que Debes Conocer

### ✅ Cómo Funciona Telegram (Correcto)
```javascript
// api/monitor.js línea 341
const mensaje = `🔔 *${con.visualRef}* se liberó en *${est.nombre}*`;
await enviarTelegram(mensaje); // Telegram bot
```
**Por qué funciona:** No depende de base de datos de usuarios. Envía a un chat fijo.

### ❌ Cómo Funciona Twilio (Incorrecto)
```javascript
// app/api/watcher/check/route.js línea 91
await sendNotification(process.env.TWILIO_CALL_RECIPIENT, watcher.station_name);
```
**Por qué NO funciona:** Ignora completamente watcher.phone_number (que no existe).

### ✅ Cómo Debería Funcionar Twilio (Propuesto)
```javascript
// app/api/watcher/check/route.js línea 91 (PROPUESTO)
await sendNotification(watcher.phone_number, watcher.station_name);
```
**Requisitos:** 
- `watcher.phone_number` debe existir en BD
- Se debe guardar al crear vigilancia
- Se debe validar formato teléfono

---

## Estaciones Monitoreadas

Configuradas en `api/monitor.js` (hardcoded):

| ID | Nombre | Ciudad |
|----|--------|--------|
| 828537 | Estacion Bus | Mérida |
| 833929 | Plaza Xirgu | Mérida |
| 828434 | Calle Almendralejo (1) | Mérida |
| 828433 | Calle Almendralejo (2) | Mérida |
| 840019 | Subestacion Merida | Mérida |
| 828536 | Hospital Merida | Mérida |

**Nota:** Las estaciones se consultan desde Electromaps en tiempo real. Los IDs son solo referencias.

---

## Logs y Debugging

### Ver que está pasando:
```bash
# Terminal - Ver logs del dev server
npm run dev

# Ver logs de Supabase (en Supabase dashboard)
# Ir a: SQL → Query → Ver logs de actividad

# Ver historial de cambios:
SELECT * FROM connector_state_changes ORDER BY detected_at DESC LIMIT 20;

# Ver vigilancias activas:
SELECT * FROM active_watchers WHERE status = 'active';
```

### Formato de console.log para debugging:
```javascript
console.log("[v0] Estado actual:", connector_state);
console.log("[v0] Vigilancia encontrada:", watcher.station_name);
console.log("[v0] Enviando Twilio a:", phoneNumber);
```

---

## Próximos Pasos Para Arreglar Twilio

1. **Entiende el flujo:** Sigue este documento paso a paso
2. **Examina los archivos:**
   - `app/components/WatcherModal.tsx` - Formulario
   - `app/api/watcher/route.js` - Backend POST
   - `app/services/notification-service.js` - Envío Twilio
   - `app/api/watcher/check/route.js` - Cron check
3. **Propón los cambios** - Dile qué necesitas modificar
4. **Implementa** - Pequeños cambios, test cada uno

---

## Comandos Útiles

```bash
# Desarrollo
npm run dev          # Inicia servidor local

# Build
npm run build        # Compila para producción

# Vercel deploy (desde carpeta proyecto)
vercel --prod        # Redeploy a production

# Testing endpoint local
curl http://localhost:3000/api/status

# Ver estado Git
git log --oneline -5
git branch -vv
```

---

## Checklist para Ponerse al Día

- [ ] Lee este documento completo
- [ ] Lee ARCHITECTURE.md
- [ ] Lee DATABASE_SCHEMA.md
- [ ] Abre WatcherModal.tsx y entiende el formulario
- [ ] Abre /api/watcher/route.js y entiende POST
- [ ] Abre notification-service.js y entiende sendNotification
- [ ] Abre /api/watcher/check/route.js y ve cómo se llama
- [ ] Pregunta sobre cualquier cosa confusa

---

## ¿Listo para empezar?

Di qué quieres hacer exactamente y te guío paso a paso.
