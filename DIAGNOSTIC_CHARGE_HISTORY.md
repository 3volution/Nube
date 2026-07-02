# DIAGNÓSTICO COMPLETO: FLUJO DE HISTORIAL DE CARGAS

## 1. ¿QUÉ ENDPOINT EJECUTA EL CRON?

**Endpoint:** `GET /api/watcher/check`

**Ubicación:** `/app/api/watcher/check/route.js`

**Autenticación:** Query param `?secret=<CRON_SECRET>`

**Descripción:** Scheduler externo (cron-job.org, EasyCron, GitHub Actions, etc.) que se invoca cada minuto.

---

## 2. ¿QUÉ TABLA ESCRIBE?

**DOS tablas:**

### Tabla 1: `chargeHistory`

**Campos que inserta (línea 106-118 de watcher/check/route.js):**
```javascript
{
  connector_id: freedConnectorId,           // UUID del conector
  station_id: String(watcher.station_id),   // ID de la estación
  station_name: watcher.station_name,       // Nombre de estación
  started_at: chargeStartTime,              // ISO timestamp inicio
  ended_at: chargeEndTime,                  // ISO timestamp fin
  timestamp: chargeEndTime,                 // ISO timestamp fin (copia)
  durationMinutes: durationMinutes,         // Duración en minutos
  isOverLimit: isOverLimit,                 // true si > 120 minutos
  isCompleted: true                         // Siempre true
}
```

### Tabla 2: `connector_state_changes`

**Campos que inserta (línea 120-135 de watcher/check/route.js):**
```javascript
{
  connector_id: String(freedConnectorId),
  station_id: String(watcher.station_id),
  station_name: watcher.station_name,
  estado_anterior: freedPrevStatus,         // 'OCCUPIED'
  estado_nuevo: freedCurrStatus,            // 'FREE' o 'AVAILABLE'
  fecha: fecha,                             // YYYY-MM-DD
  dia: dia,                                 // Nombre día semana
  hora: hora,                               // HH:MM:SS
  timestamp: chargeEndTime,                 // ISO timestamp
  tiempo_en_estado_anterior_segundos: durationSeconds
}
```

---

## 3. ¿QUÉ CONDICIÓN EXACTA PROVOCA LA INSERCIÓN?

**Línea 88-103 de /api/watcher/check/route.js:**

```javascript
// Buscar conector liberado: OCCUPIED → FREE o AVAILABLE
let freedConnectorId = null;
let freedPrevStatus = null;
let freedCurrStatus = null;

for (const connectorId of Object.keys(currentStates)) {
  const prev = previousStates[connectorId];
  const curr = currentStates[connectorId];
  if (prev === 'OCCUPIED' && (curr === 'FREE' || curr === 'AVAILABLE')) {
    freedConnectorId = connectorId;
    freedPrevStatus = prev;
    freedCurrStatus = curr;
    break;  // Detecta SOLO el primer conector liberado
  }
}

if (freedConnectorId) {
  // 🔥 INSERCIÓN OCURRE AQUÍ
}
```

**Condiciones exactas:**
1. `previousStates[connectorId] === 'OCCUPIED'`
2. AND `(currentStates[connectorId] === 'FREE' OR currentStates[connectorId] === 'AVAILABLE')`
3. AND (`freedConnectorId` no es null)
4. AND NO existe alerta 'ringing' activa en `watcher_call_events` (línea 143-149)

**IMPORTANTE:** Solo detecta el PRIMER conector que se libera por iteración. Si se liberan múltiples al mismo tiempo, solo se registra el primero.

---

## 4. ¿QUÉ TABLA LEEN MONITOR Y MONITOR POLICÍA?

**Monitor (/app/monitor/page.tsx):**
- Lee: `connector_state_changes` (línea 92)
- Endpoint: `GET /api/state-changes?limit=10000`
- Procesa: TODOS los cambios de estado

**Monitor Policía Local (/app/monitor-policialocal/page.tsx):**
- Lee: Misma lógica que Monitor
- Endpoint: `GET /api/state-changes?limit=10000`

---

## 5. ¿QUÉ ENDPOINT CONSUMEN PARA MOSTRAR HISTORIAL?

**Endpoint: `GET /api/state-changes`**

**Ubicación:** `/app/api/state-changes/route.js`

**Lógica (línea 1-48):**
```javascript
// 1. Obtiene últimos 10000 registros de connector_state_changes
// 2. Ordena por ID descendente (más recientes primero)
// 3. Formatea respuesta (mapea campos old_status/new_status, etc.)
// 4. Devuelve JSON

GET /api/state-changes?limit=10000
→ Obtiene los últimos 10,000 cambios de estado
→ Lee tabla: connector_state_changes
```

---

## 6. ¿QUÉ FILTROS APLICA?

### En `/api/state-changes/route.js`:

**Filtro 1:** Límite de registros
```javascript
limit=${limit}  // Default: 100, Max: 10000
```
- Monitor pide 10,000 registros

**Filtro 2:** Orden
```javascript
order=id.desc  // Descendente (más recientes primero)
```

### En Monitor (/app/monitor/page.tsx línea 150-212):

**Filtro 1: Emparejamiento OCCUPIED→FREE**
```javascript
// Línea 152-164: Busca pares OCCUPIED→FREE para el MISMO conector
// Si connectorId es OCUPADO en evento i
// Y connectorId es FREE en evento j > i
// → Crea una SOLA línea de carga (deduplicada)
```

**Filtro 2: Deduplicación**
```javascript
// Línea 189-203
// Clave deduplicación: connector_id + fecha + hora
// Mantiene SOLO la primera carga por connector/fecha/hora
```

**Filtro 3: Últimos 30 días**
```javascript
// Línea 206-210
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

.filter(c => new Date(c.startTimestamp || c.timestamp).getTime() >= thirtyDaysAgo.getTime());
```

**Filtro 4: Hoy (para estadísticas)**
```javascript
// Línea 214-248
// Compara fechas en UTC
// Si timestamp está en rango [00:00 UTC, 23:59 UTC] de hoy → cuenta como "hoy"
```

---

## 7. CONSULTAS SQL PARA VERIFICAR EN SUPABASE

### 7.1 Verificar si se insertaron registros HOY en `chargeHistory`:

```sql
-- Todos los registros de hoy
SELECT 
  id,
  connector_id,
  station_name,
  started_at,
  ended_at,
  durationMinutes,
  isOverLimit,
  timestamp
FROM chargeHistory
WHERE DATE(timestamp) = CURRENT_DATE
ORDER BY timestamp DESC;

-- Contar
SELECT COUNT(*) as total_hoy FROM chargeHistory 
WHERE DATE(timestamp) = CURRENT_DATE;

-- Últimos 5
SELECT * FROM chargeHistory 
ORDER BY timestamp DESC 
LIMIT 5;
```

### 7.2 Verificar si se insertaron registros HOY en `connector_state_changes`:

```sql
-- Todos hoy
SELECT 
  id,
  connector_id,
  station_name,
  estado_anterior,
  estado_nuevo,
  fecha,
  hora,
  tiempo_en_estado_anterior_segundos,
  timestamp
FROM connector_state_changes
WHERE fecha = CAST(CURRENT_DATE AS TEXT)
ORDER BY timestamp DESC;

-- Contar
SELECT COUNT(*) as total_hoy FROM connector_state_changes 
WHERE fecha = CAST(CURRENT_DATE AS TEXT);

-- Solo cambios OCCUPIED→FREE hoy
SELECT 
  id,
  connector_id,
  station_name,
  estado_anterior,
  estado_nuevo,
  timestamp
FROM connector_state_changes
WHERE fecha = CAST(CURRENT_DATE AS TEXT)
  AND estado_anterior = 'OCCUPIED'
  AND (estado_nuevo = 'FREE' OR estado_nuevo = 'AVAILABLE')
ORDER BY timestamp DESC;
```

### 7.3 Contar registros desde hoy hacia atrás:

```sql
-- chargeHistory
SELECT 
  DATE(timestamp) as fecha,
  COUNT(*) as cantidad
FROM chargeHistory
GROUP BY DATE(timestamp)
ORDER BY fecha DESC
LIMIT 30;  -- Últimos 30 días

-- connector_state_changes
SELECT 
  fecha,
  COUNT(*) as cantidad
FROM connector_state_changes
GROUP BY fecha
ORDER BY fecha DESC
LIMIT 30;
```

### 7.4 Verificar el ÚLTIMO registro insertado:

```sql
-- Último en chargeHistory
SELECT * FROM chargeHistory 
ORDER BY timestamp DESC 
LIMIT 1;

-- Último en connector_state_changes
SELECT * FROM connector_state_changes 
ORDER BY timestamp DESC 
LIMIT 1;

-- Última carga completada (OCCUPIED→FREE)
SELECT * FROM connector_state_changes 
WHERE estado_anterior = 'OCCUPIED' 
  AND (estado_nuevo = 'FREE' OR estado_nuevo = 'AVAILABLE')
ORDER BY timestamp DESC 
LIMIT 1;
```

### 7.5 Verificar si hay vigilancias activas:

```sql
-- Vigilancias activas AHORA
SELECT 
  id,
  station_id,
  station_name,
  status,
  last_connector_states,
  created_at
FROM active_watchers
WHERE status = 'active'
ORDER BY created_at DESC;

-- Todas las vigilancias (activas o no)
SELECT 
  id,
  station_id,
  station_name,
  status,
  created_at,
  updated_at
FROM active_watchers
ORDER BY updated_at DESC;
```

### 7.6 Verificar alertas ringing activas (por qué no se lanzan más llamadas):

```sql
-- Alertas "ringing" activas
SELECT 
  id,
  watcher_id,
  station_name,
  status,
  call_attempt,
  max_attempts,
  last_attempt_at,
  trigger_connector_id,
  trigger_previous_status,
  trigger_current_status
FROM watcher_call_events
WHERE status = 'ringing'
ORDER BY last_attempt_at DESC;

-- Ver si hay alertas antiguas (> 30 minutos) que deberían haber expirado
SELECT 
  id,
  station_name,
  status,
  last_attempt_at,
  NOW() - last_attempt_at as tiempo_sin_actualizar
FROM watcher_call_events
WHERE status = 'ringing'
  AND (NOW() - last_attempt_at) > INTERVAL '30 minutes'
ORDER BY last_attempt_at DESC;
```

---

## 8. ANÁLISIS DE ERRORES SILENCIOSOS

### ¿Hay catch vacío o errores no propagados?

**En `/api/watcher/check/route.js`:**

| Línea | Tipo | Gravedad | Descripción |
|-------|------|----------|-------------|
| 59-60 | try/catch | MEDIA | Falla al obtener watchers activos, devuelve error 500 |
| 77-210 | try/catch | BAJA | Loop por cada estación atrapa errores individuales |
| 137-151 | catch específico | **CRÍTICA** | Insert en `connector_state_changes` falla silenciosamente |
| 150-151 | console.error | Logging | Si falla insert, se loguea pero NO detiene inserción en chargeHistory |
| 209-210 | catch specific | MEDIA | Error en estación específica, continúa con otras |
| 220-222 | catch general | MEDIA | Error general del endpoint |

### El punto crítico (línea 137-151):

```javascript
const { error: stateChangeError } = await supabase
  .from('connector_state_changes')
  .insert({...});  // Si esto FALLA...

if (stateChangeError) {
  console.error('watcher/check - error insertando state_change:', stateChangeError.message);
  // ↓ NO hay "return" aquí
  // El código continúa aunque haya habido error
  // La inserción en chargeHistory ya pasó (línea 106-118)
}
```

**IMPORTANTE:** Si `connector_state_changes` falla, la carga YA está en `chargeHistory`, pero NO aparece en Monitor (porque Monitor lee de `connector_state_changes`).

---

## 9. PUNTOS DONDE SERÍA ÚTIL AÑADIR LOGS TEMPORALES

### Punto A: Verificar si el cron se ejecuta
```javascript
// Al inicio de GET /api/watcher/check (línea 43)
console.log('[v0] CRON START:', new Date().toISOString(), 'Secret valido:', secret === process.env.CRON_SECRET);
```

### Punto B: Verificar si hay vigilancias activas
```javascript
// Después línea 59 en /api/watcher/check
console.log('[v0] CRON - Vigilancias encontradas:', watchers.length);
```

### Punto C: Verificar si se detecta liberación
```javascript
// Dentro del loop, antes de línea 100
console.log('[v0] CRON - Conector', connectorId, 'Anterior:', prev, 'Actual:', curr);
if (freedConnectorId) {
  console.log('[v0] CRON - LIBERACIÓN DETECTADA:', freedConnectorId, 'De:', freedPrevStatus, 'A:', freedCurrStatus);
}
```

### Punto D: Verificar si hay alerta ringing que bloqueaba
```javascript
// Después línea 143
console.log('[v0] CRON - Buscando alerta ringing para watcher', watcher.id);
console.log('[v0] CRON - Alerta ringing existente:', existingAlert ? 'SÍ' : 'NO');
```

### Punto E: Verificar si inserta en chargeHistory
```javascript
// Después inserción línea 118, antes de line 120
console.log('[v0] CRON - Insertado en chargeHistory');
```

### Punto F: Verificar si falla insert en connector_state_changes
```javascript
// Después línea 150
if (stateChangeError) {
  console.log('[v0] ERROR CRÍTICO - No se insertó en connector_state_changes:', stateChangeError.message);
}
```

### Punto G: Verificar si se lanzan llamadas
```javascript
// Después línea 169
if (callResult.success) {
  console.log('[v0] CRON - Llamada Twilio exitosa. CallSID:', callResult.callSid);
} else {
  console.log('[v0] CRON - Llamada Twilio falló:', callResult.error);
}
```

---

## 10. PROCESO DE LIMPIEZA AUTOMÁTICA DEL HISTORIAL

### ¿Qué endpoint hace la limpieza?

**NINGUNO.** No existe proceso automático de limpieza.

### ¿Qué tabla limpia?

N/A - No hay limpieza automática.

### ¿Cada cuánto se ejecuta?

N/A

### ¿Qué registros elimina?

N/A

### ¿Puede estar eliminando registros recientes por error?

**NO.** Los únicos DELETE que existen son manuales:
- `DELETE /api/monitoring/[id]` - Elimina monitoreos específicos
- `DELETE /api/watcher` - Cancela vigilancias específicas

Las tablas `chargeHistory` y `connector_state_changes` NUNCA son limpiadas automáticamente.

---

## 11. RESUMEN DE PUNTOS CRÍTICOS

| Problema | Línea | Causa | Síntoma |
|----------|-------|-------|---------|
| El cron no ejecuta | N/A | Scheduler externo caído o no configurado | chargeHistory vacío |
| No hay vigilancias activas | 55 | Usuario no activó vigilancia | No se detectan liberaciones |
| Falla Electromaps | 80 | API caída o credenciales inválidas | Salida anticipada (early exit) |
| Error insertando chargeHistory | 106-118 | Error Supabase | **Será visible en chargeHistory vacío** |
| **ERROR INSERTANDO state_change** | **137-151** | **Error Supabase** | **chargeHistory tiene registros, pero Monitor está vacío** |
| Alerta ringing bloqueada | 143-149 | Alerta antigua sin expiración | No se lanzan nuevas llamadas |
| Filtro 30 días | 206-210 | Timestamp muy antiguo | Cargas recientes filtradas si fecha incorrecta |

---

## 12. CÓMO DEBUGGEAR PASO A PASO

**Paso 1:** Ejecutar en Supabase la consulta del punto 7.5
```sql
SELECT * FROM active_watchers WHERE status = 'active';
```
- Si está vacío → Usuario no ha activado vigilancia
- Si tiene registros → Hay vigilancia activa

**Paso 2:** Ejecutar consulta del punto 7.2
```sql
SELECT COUNT(*) FROM connector_state_changes 
WHERE fecha = CAST(CURRENT_DATE AS TEXT);
```
- Si es 0 → El cron NO ejecutó HOY (o no detectó liberaciones)
- Si > 0 → El cron ejecutó y detectó cambios

**Paso 3:** Ejecutar consulta del punto 7.1
```sql
SELECT COUNT(*) FROM chargeHistory 
WHERE DATE(timestamp) = CURRENT_DATE;
```
- Si es 0 → No se insertó en chargeHistory (falla en línea 106-118)
- Si > COUNT de state_changes → Falla en línea 137-151 (error silencioso)

**Paso 4:** Ver última ejecución del cron
```sql
SELECT * FROM connector_state_changes 
ORDER BY timestamp DESC LIMIT 1;
```
- Observar timestamp y comparar con hora actual

**Paso 5:** Verificar alertas ringing bloqueadas
```sql
SELECT * FROM watcher_call_events 
WHERE status = 'ringing' 
ORDER BY last_attempt_at DESC;
```
- Si hay alertas muy antiguas → Pueden estar bloqueando nuevas detecciones
