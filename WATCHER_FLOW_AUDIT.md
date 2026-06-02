# AUDITORÍA FUNCIONAL DEL FLUJO DE VIGILANCIA (WATCHER)
## Extremo a extremo - Paso a paso

---

## PASO 1: Usuario pulsa "Activar vigilancia"

**Componente:** `app/components/WatcherModal.tsx` línea 41-86

**Código:**
```typescript
const handleStartWatcher = async () => {
  const response = await fetch('/api/watcher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      station_id: station.id,
      station_name: station.name
    })
  });
}
```

**Datos de entrada:**
- `station_id`: ID de la estación (ej: "001")
- `station_name`: Nombre legible (ej: "RENAULT MERIDA")

**Dependencias externas:** Ninguna en el cliente

---

## PASO 2: Se crea el registro en `active_watchers`

**Endpoint:** POST `/api/watcher` 
**Archivo:** `app/api/watcher/route.js` línea 19-96

**Flujo de código:**
1. Recibe `station_id`, `station_name` del cliente (línea 21)
2. Verifica si no existe vigilancia activa (línea 30-35)
3. Consulta Electromaps via `obtenerDatosEstacion(station_id, user, pass)` (línea 52)
4. Crea snapshot de estado: `connectorStates = { connector_id: 'OCCUPIED', ... }` (línea 72-75)
5. Elimina registros previos completed/cancelled/failed (línea 78-80)
6. INSERT en `active_watchers` (línea 87-96)

**INSERT realizado:**
```javascript
const { data: watcher } = await supabase
  .from('active_watchers')
  .insert({
    station_id,
    station_name,
    last_connector_states: connectorStates,
    status: 'active',
    retry_count: 0
  })
  .select()
  .single();
```

**Registro creado en BD:**
```
{
  id: UUID,
  station_id: "001",
  station_name: "RENAULT MERIDA",
  created_at: NOW(),
  status: "active",
  last_connector_states: { "003649": "OCCUPIED", "003650": "OCCUPIED", ... },
  retry_count: 0
}
```

**Tablas utilizadas:**
- `active_watchers` (INSERT, DELETE previous)

**Variables de entorno:**
- `SUPABASE_URL` (requerida)
- `SUPABASE_SERVICE_ROLE_KEY` (requerida)
- `ELECTROMAPS_USER` (requerida)
- `ELECTROMAPS_PASS` (requerida)

---

## PASO 3: El cron externo invoca `/api/watcher/check`

**Invocador:** cron-job.org (NO CONFIGURADO - usuario debe hacerlo manualmente)

**URL a llamar:**
```
GET https://tu-dominio.com/api/watcher/check?secret=CRON_SECRET
```

**Endpoint:** GET `/api/watcher/check`
**Archivo:** `app/api/watcher/check/route.js` línea 27-170

**Código de autenticación (línea 29-35):**
```javascript
const { searchParams } = new URL(request.url);
const secret = searchParams.get('secret');

if (secret !== process.env.CRON_SECRET) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Verificación:** ¿Hay vigilancias activas? (línea 41-54)
```javascript
const { data: watchers } = await supabase
  .from('active_watchers')
  .select('*')
  .eq('status', 'active');

if (!watchers || watchers.length === 0) {
  return Response.json({ success: true, checked: 0, calls_made: 0 });
}
```

**Variables de entorno requeridas:**
- `CRON_SECRET` (requerida)
- `SUPABASE_URL` (requerida)
- `SUPABASE_SERVICE_ROLE_KEY` (requerida)
- `ELECTROMAPS_USER` (requerida)
- `ELECTROMAPS_PASS` (requerida)

---

## PASO 4: Se detecta transición OCCUPIED → FREE

**Archivo:** `app/api/watcher/check/route.js` línea 68-100

**Flujo de código:**

1. Para cada vigilancia activa (línea 68)
2. Consulta Electromaps: `conectores = obtenerDatosEstacion(station_id, user, pass)` (línea 71)
3. Crea mapa de estado actual: `currentStates = { connector_id: 'FREE' | 'OCCUPIED' }` (línea 79-82)
4. Lee estado anterior: `previousStates = watcher.last_connector_states` (línea 85)
5. Compara conector a conector (línea 89-99):

```javascript
for (const connectorId of Object.keys(currentStates)) {
  const previousStatus = previousStates[connectorId];
  const currentStatus = currentStates[connectorId];

  // Detectar transición OCCUPIED -> FREE
  if (previousStatus === 'OCCUPIED' && currentStatus === 'FREE') {
    freedConnectorFound = true;
    freedConnectorId = connectorId;
    break;
  }
}
```

**Variables capturadas:**
- `freedConnectorFound`: boolean = true
- `freedConnectorId`: string = "003649"
- `watcher.station_name`: string = "RENAULT MERIDA"
- `watcher.id`: UUID
- `watcher.retry_count`: integer = 0

---

## PASO 5: Se ejecuta la lógica de notificación

**Archivo:** `app/api/watcher/check/route.js` línea 102-144

**Código:**
```javascript
if (freedConnectorFound) {
  console.log(`[v0] Iniciando llamada Twilio para estación ${watcher.station_name}`);
  
  const message = `Hola Nacho. Un cargador ha quedado libre en ${watcher.station_name}. Repito: hay un cargador disponible en ${watcher.station_name}.`;
  
  try {
    await sendNotification(message);  // ← LÍNEA CRÍTICA 111
    callsMade++;
    
    // ...
  } catch (twilioError) {
    // reintentos
  }
}
```

**Datos pasados a sendNotification:**
- Argumento 1: `message` = string con el mensaje de voz
- Argumento 2: NINGUNO

---

## PASO 6: Se realiza la llamada Twilio

**Archivo:** `app/services/notification-service.js` línea 32-40

**Firma actual:**
```javascript
export async function sendNotification(phoneNumber, stationName) {
  try {
    const result = await sendTwilioCall(phoneNumber, stationName);
    return result;
  }
}
```

**PROBLEMA CRÍTICO:**
- Espera: `sendNotification(phoneNumber, stationName)`
- Recibe: `sendNotification(message)` donde `message = "Hola Nacho..."`
- Resultado: `phoneNumber = "Hola Nacho..."`, `stationName = undefined`

**Funciones llamadas internamente:**

`sendTwilioCall(phoneNumber, stationName)` (línea 43-90):
```javascript
const message = `Hola ${stationName}...`;
const twiml = `<Response><Say voice="alice">${message}</Say></Response>`;

const call = await twilio.calls.create({
  to: phoneNumber,        // ← Recibe el string "Hola Nacho..."
  from: process.env.TWILIO_PHONE_NUMBER,
  twiml: twiml
});
```

**Variables de entorno:**
- `TWILIO_ACCOUNT_SID` (requerida)
- `TWILIO_AUTH_TOKEN` (requerida)
- `TWILIO_PHONE_NUMBER` (requerida - el número origen)

---

## PASO 7: Se marca la vigilancia como `completed`

**Archivo:** `app/api/watcher/check/route.js` línea 114-118

**Si la llamada Twilio ES EXITOSA (muy improbable):**
```javascript
await supabase
  .from('active_watchers')
  .update({ status: 'completed' })
  .eq('id', watcher.id);
```

**Si la llamada Twilio FALLA (caso normal con el bug actual):**
```javascript
const newRetryCount = (watcher.retry_count || 0) + 1;

if (newRetryCount >= MAX_RETRIES) {
  // Reintento 5 fallido -> status = 'failed'
  await supabase
    .from('active_watchers')
    .update({ status: 'failed', retry_count: newRetryCount })
    .eq('id', watcher.id);
} else {
  // Reintentar próximo minuto
  await supabase
    .from('active_watchers')
    .update({ retry_count: newRetryCount })
    .eq('id', watcher.id);
}
```

**Resultado en BD:**
```
{
  status: 'completed' o 'failed',
  retry_count: 0 (si éxito) o 1-5 (si fallos)
}
```

---

## RESUMEN DEL FLUJO DE DATOS

```
Cliente (WatcherModal)
  ↓ POST { station_id, station_name }
  ↓
POST /api/watcher
  ├─ Consulta Electromaps → snapshot estado
  └─ INSERT active_watchers
       ├─ station_id: string
       ├─ station_name: string
       ├─ last_connector_states: { "003649": "OCCUPIED", ... }
       ├─ status: "active"
       └─ retry_count: 0
  ↓ respuesta { watcher: {...} }
  ↓
Cliente recibe OK
  ↓
  ↓ (usuario cierra modal)
  ↓
  ↓ (espera a cron externo)
  ↓
cron-job.org cada minuto
  ↓ GET /api/watcher/check?secret=X
  ↓
GET /api/watcher/check
  ├─ SELECT * FROM active_watchers WHERE status = 'active'
  ├─ Para cada: Consulta Electromaps
  ├─ Compara: last_connector_states vs estado actual
  ├─ Si OCCUPIED→FREE: intenta sendNotification(message)
  │   ├─ ❌ ENVÍO A NÚMERO INCORRECTO (recibe string, no teléfono)
  │   ├─ ❌ NÚMERO DESTINO NO EXISTE EN BD
  │   └─ catch → retry_count++, status persiste 'active'
  └─ Tras 5 fallos: status = 'failed'
```

---

# RESPUESTAS A LAS PREGUNTAS CRÍTICAS

## A) ¿Puede el sistema actual realizar una llamada Twilio real de extremo a extremo sin modificaciones?

**RESPUESTA: NO. Es imposible.**

---

## B) Enumera todos los bloqueos concretos que lo impiden

### BLOQUEO 1: Firma incorrecta de `sendNotification`

**Severidad:** CRÍTICO
**Archivo:** `app/api/watcher/check/route.js` línea 111
**Problema:** 
```javascript
await sendNotification(message);  // recibe 1 argumento
```

**Pero `sendNotification` espera:**
```javascript
export async function sendNotification(phoneNumber, stationName)  // espera 2
```

**Resultado:** `phoneNumber` recibe el string del mensaje en lugar del número de teléfono.

---

### BLOQUEO 2: Sin campo `phone_number` en `active_watchers`

**Severidad:** CRÍTICO
**Archivo:** `scripts/create-active-watchers-table.sql`
**Problema:** La tabla NO tiene columna `phone_number`

**Esquema actual:**
```sql
CREATE TABLE active_watchers (
  id UUID PRIMARY KEY,
  station_id TEXT,
  station_name TEXT,
  created_at TIMESTAMPTZ,
  status TEXT,
  last_connector_states JSONB,
  retry_count INTEGER
);
```

**Falta:** `phone_number TEXT NOT NULL`

**Consecuencia:** El endpoint `/api/watcher/check` no tiene forma de obtener el número destino. Aunque corrigieras la firma, la llamada no sabe a quién llamar.

---

### BLOQUEO 3: Cron externo NO configurado

**Severidad:** CRÍTICO
**Archivo:** Ninguno (es configuración externa)
**Problema:** El endpoint `/api/watcher/check` existe, pero nadie lo invoca.

**Estado actual:**
- cron-job.org: NO CONFIGURADO
- Usuario: NO SABE que debe configurarlo
- Documentación: NO EXISTE

**Consecuencia:** Aunque todo el código fuera correcto, la vigilancia nunca se ejecutaría porque el cron nunca llama al endpoint.

---

### BLOQUEO 4: Variable de entorno `CRON_SECRET` no documentada

**Severidad:** ALTO
**Archivo:** `app/api/watcher/check/route.js` línea 33
**Problema:**
```javascript
if (secret !== process.env.CRON_SECRET) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Estado:** `CRON_SECRET` no está en `.env.example` ni documentado
**Consecuencia:** Usuario no sabe qué valor usar en cron-job.org

---

### BLOQUEO 5: Sin `.env.example` con variables requeridas

**Severidad:** ALTO
**Archivo:** Raíz del proyecto
**Problema:** NO EXISTE `.env.example`

**Variables REQUERIDAS para que funcione el sistema:**
```
# Electromaps
ELECTROMAPS_USER=
ELECTROMAPS_PASS=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Cron
CRON_SECRET=
```

**Consecuencia:** Usuario no sabe qué variables necesita configurar.

---

## C) Para cada bloqueo: Severidad, Archivo, Línea, Corrección mínima

| Bloqueo | Severidad | Archivo | Línea | Corrección mínima |
|---------|-----------|---------|-------|-------------------|
| 1. Firma sendNotification | CRÍTICO | `watcher/check/route.js` | 111 | `await sendNotification(watcher.phone_number, watcher.station_name)` |
| 2. Sin phone_number en BD | CRÍTICO | `create-active-watchers-table.sql` | — | `ALTER TABLE ADD COLUMN phone_number TEXT NOT NULL` |
| 3. Cron externo no configurado | CRÍTICO | (configuración externa) | — | Crear documentación + instrucciones en README |
| 4. CRON_SECRET no documentado | ALTO | `.env.example` | — | Crear `.env.example` con todas las variables |
| 5. Sin `.env.example` | ALTO | Raíz | — | Crear `.env.example` |

---

## D) Estado actual: Imposible de ejecutar

**El sistema de vigilancia NO PUEDE hacer una llamada Twilio en su forma actual porque:**

1. ❌ `active_watchers` no almacena el número destino
2. ❌ `sendNotification` recibe la firma incorrecta
3. ❌ El cron externo nunca se invoca (no configurado)
4. ❌ No hay documentación de cómo configurar el cron

**Incluso si el usuario configurara correctamente cron-job.org, la llamada Twilio recibiría:**
- `to`: `"Hola Nacho. Un cargador ha quedado libre..."` (un string, no un número)
- `from`: número Twilio válido
- Resultado: Error 400 de Twilio: "Invalid To parameter"

---

## RECOMENDACIÓN

No procede hacer un PR hasta corregir estos bloqueos. El sistema de vigilancia está incompleto por diseño.

**Orden de corrección recomendado:**
1. Añadir `phone_number` a `active_watchers` (incluir en POST `/api/watcher`)
2. Corregir llamada a `sendNotification` en `watcher/check`
3. Crear `.env.example` documentado
4. Crear README con instrucciones de configuración de cron-job.org
5. Crear script de migración SQL para usuarios existentes

