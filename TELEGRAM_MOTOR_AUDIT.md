# AUDITORÍA TÉCNICA COMPLETA - MOTOR TELEGRAM vs MOTOR WATCHER

## CONCLUSIÓN EJECUTIVA

Se encontraron **TRES MOTORES INDEPENDIENTES**:
1. **Motor Cron `/api/cron/check-chargers.js`** - OBSOLETO/NO UTILIZADO
2. **Motor Telegram Webhook `/api/telegram-webhook/route.js`** - CONTROL MANUAL + REGISTRO
3. **Motor Watcher `/api/watcher/check/route.js`** - AUTOMATIZACIÓN REAL

**El motor Telegram APARENTA funcionar pero NO genera notificaciones automáticas.** Es un webhook de control manual controlado por comandos Telegram.

---

## 1. IDENTIFICACIÓN DE ENDPOINTS

### Motor 1: `/api/cron/check-chargers.js` 
**Tipo:** POST desde cron
**Trigger:** Bearer token en header `Authorization`
**Tabla:** `charger_monitoring` (obsoleto)
**Estado:** APARENTEMENTE FUNCIONAL pero sin evidencia de uso

### Motor 2: `/api/telegram-webhook/route.js`
**Tipo:** POST desde Telegram Bot API
**Trigger:** Webhook HTTP recibiendo comandos Telegram
**Comandos:** `/ocupar`, `/liberar`, `/estado`
**Tablas:** 
- `test_connectors` (datos ficticios de prueba)
- `connector_state_changes` (registro de cambios)
**Estado:** ✅ FUNCIONAL - Es un control manual, no automático

### Motor 3: `/api/watcher/check/route.js`
**Tipo:** GET desde cron externo
**Trigger:** `?secret=CRON_SECRET`
**Tabla:** `active_watchers` (vigilancias configuradas)
**Estado:** ✅ FUNCIONAL - Motor real de automatización

---

## 2. CADENA COMPLETA TELEGRAM

### 2.1 ORIGEN: Webhook Manual Telegram

```
Usuario (Telegram)
    ↓
/liberar 003657 (comando)
    ↓
POST → telegram-webhook/route.js
    ↓
Valida chat_id contra TELEGRAM_CHAT_ID
    ↓
Extrae connector_id de comando
```

### 2.2 DETECCIÓN (Líneas 149-168 de telegram-webhook)

```javascript
// Obtener estado anterior ANTES de actualizar
const prevResLib = await fetch(
  `${SUPABASE_URL}/rest/v1/test_connectors?connector_id=eq.${connectorId}`,
  headers: { 'Authorization': `Bearer ${SUPABASE_KEY}` }
);
const prevDataLib = await prevResLib.json();
const estadoAnteriorLib = prevDataLib[0].status;  // ← OBTIENE ESTADO ANTERIOR

// Si ya está LIBRE, no hacer nada
if (estadoAnteriorLib === 'FREE') {
  await enviarRespuesta(`El cargador ${connectorId} ya esta LIBRE`);
  return Response.json({ ok: true });
}
```

**Almacenamiento del estado anterior:**
- Se obtiene de `test_connectors` table ANTES de cambiar
- Solo se usa para calcular `tiempoEnEstado`
- NO persiste en ningún "último estado conocido"

### 2.3 COMPARACIÓN Y DECISIÓN (Línea 169-194)

```javascript
// Calcula tiempo en estado anterior
let tiempoEnEstado = 0;
if (prevTimestamp) {
  tiempoEnEstado = Math.floor((new Date() - new Date(prevTimestamp)) / 1000);
}

// Borrar registro anterior
await fetch(`DELETE test_connectors WHERE connector_id = ${connectorId}`);

// Guardar nuevo estado
await fetch(`INSERT INTO test_connectors (connector_id, status, status_updated_at)`);

// Registra cambio de estado
await fetch(`INSERT INTO connector_state_changes (...)`);
```

**Lógica de decisión:**
- No hay lógica condicional de "notificación"
- Solo registra el cambio en `connector_state_changes`
- El cambio se envía a Telegram como confirmación del comando

### 2.4 ENVÍO TELEGRAM (Línea 196)

```javascript
const minutos = Math.floor(tiempoEnEstado / 60);
await enviarRespuesta(
  `${stationInfoLib.station_name} - Cargador ${connectorId} LIBERADO (${minutos}m cargando)`
);
```

**Resultado:** Respuesta de confirmación en Telegram, NO una notificación automática.

---

## 3. ALMACENAMIENTO DEL ESTADO ANTERIOR

### Motor Telegram: EFÍMERO
```
test_connectors table
├─ connector_id (clave)
├─ status (OCCUPIED/FREE)
└─ status_updated_at (timestamp)

Ciclo:
1. Lee estado anterior
2. Borra registro
3. Escribe nuevo estado
4. ← Estado anterior DESAPARECE
```

**Problema:** El estado se sobrescribe completamente. No hay historial de transiciones.

### Motor Watcher: PERSISTENTE
```
active_watchers table
├─ id
├─ station_id
├─ last_connector_states  ← JSON con TODOS los conectores
├─ status (active/completed/failed)
└─ retry_count

Ciclo:
1. Lee last_connector_states (snapshot anterior)
2. Consulta Electromaps (estado actual)
3. Compara TODAS las transiciones
4. Actualiza last_connector_states ← Se preserva para próxima iteración
```

**Ventaja:** Persiste el estado anterior para detectar transiciones en la siguiente ejecución.

---

## 4. FALSOS POSITIVOS

### Motor Telegram: POSIBLE
```
Escenario:
1. Usuario hace /liberar 003657 (correcto)
2. Webhook registra cambio de OCCUPIED → FREE
3. Usuario hace /liberar 003657 NUEVAMENTE (duplicado)
4. Webhook verifica: "ya está FREE" → No hace nada ✓

Protección: Sí, valida estado actual antes de cambiar
Pero: Usa datos ficticios de test_connectors, no datos reales de Electromaps
```

### Motor Watcher: RARO pero POSIBLE
```
Escenario:
1. Detecta OCCUPIED → FREE
2. Hace llamada Twilio (éxito)
3. Marca vigilancia como 'completed'
4. Siguiente ciclo: no procesa esa vigilancia (status ≠ 'active')

Protección: Sí, por status='active' en línea 44
Pero: Si la llamada falla 5 veces, se marca como 'failed' y sigue intentando si se reactiva
```

---

## 5. DUPLICADOS

### Motor Telegram: POSIBLE DUPLICADO CON MOTOR WATCHER
```
Problema identificado:
- Motor Telegram usa test_connectors (FICTICIOS)
- Motor Watcher usa Electromaps (DATOS REALES)
- Ambos pueden registrar en connector_state_changes

Ejemplo de duplicado:
1. Usuario: /liberar 003657 en Telegram
   → Registra en connector_state_changes
   → INSERT {connector_id: 003657, estado_anterior: OCCUPIED, estado_nuevo: FREE}

2. Cron ejecuta /api/watcher/check
   → Consulta Electromaps (datos reales)
   → Si Electromaps también dice FREE
   → Detecta OCCUPIED → FREE
   → ¿Hace llamada Twilio?
   
Resultado: DOS registros en connector_state_changes para la MISMA transición
```

---

## 6. DIFERENCIAS: MOTOR TELEGRAM vs MOTOR WATCHER

| Aspecto | Telegram | Watcher |
|---------|----------|---------|
| **Trigger** | Comando manual `/liberar` | Cron automático cada minuto |
| **Fuente datos** | `test_connectors` (ficticios) | Electromaps (datos reales) |
| **Detección** | Usuario manual | Comparación OCCUPIED→FREE |
| **Notificación** | Respuesta Telegram | Llamada Twilio |
| **Estado anterior** | Lectura de `test_connectors` | Persistente en `last_connector_states` JSON |
| **Persistencia** | Se sobrescribe | Se actualiza para próxima iteración |
| **Tabla registro** | `connector_state_changes` | `active_watchers` (interna) |
| **Reintentos** | NO | Sí (hasta 5 intentos) |
| **Automatización** | NO - Manual | SÍ - Automática |

---

## 7. ¿MISMO MOTOR LÓGICO?

**NO. Son completamente diferentes:**

```
Motor Telegram:
├─ Inicia: Comando manual del usuario
├─ Procesa: Control de estado ficticio
├─ Registra: Cambios en table `connector_state_changes`
├─ Notifica: Respuesta Telegram al usuario
└─ Objetivo: Control manual + auditoría

Motor Watcher:
├─ Inicia: Cron externo cada minuto
├─ Procesa: Comparación de estado real (Electromaps)
├─ Registra: Cambios en table `active_watchers`
├─ Notifica: Llamada Twilio automática
└─ Objetivo: Automatización de notificaciones
```

**Única similitud:** Ambos usan `connector_state_changes` para audit trail.

---

## 8. ¿ES EL MOTOR TELEGRAM FIABLE?

**SÍ - Pero no para lo que crees:**

### ✅ Lo que hace BIEN:
- Recibe comandos Telegram correctamente
- Valida autenticación (chat_id)
- Persiste datos en Supabase correctamente
- Registra cambios en `connector_state_changes`
- Calcula tiempo en estado anterior correctamente
- Envía respuestas Telegram

### ❌ Lo que NO hace:
- NO genera notificaciones automáticas
- NO consulta Electromaps (usa datos ficticios)
- NO hace llamadas Twilio
- NO es el "motor que estás viendo en logs"

### ⚠️ CONCLUSIÓN: 
**El motor Telegram NO aparenta funcionar. Es un webhook de control manual. Lo que ves en los logs de Telegram es el Usuario haciendo comandos, no el sistema haciendo detecciones automáticas.**

---

## 9. ¿ENTONCES POR QUÉ VES CAMBIOS EN TELEGRAM?

Porque:
1. **Usuario manual:** Haces `/liberar 003657` en Telegram
2. **Webhook recibe:** POST con el comando
3. **Webhook procesa:** Cambia estado de OCCUPIED a FREE
4. **Webhook responde:** "Cargador 003657 LIBERADO"
5. **Ves en Telegram:** La respuesta del webhook

**Lo que crees que ves:**
- "El sistema está detectando cambios automáticamente en Telegram"

**Lo que realmente está pasando:**
- "Tú estás cambiando manualmente el estado ficticio y el webhook te confirma"

---

## 10. MOTOR REAL DE AUTOMATIZACIÓN

El motor REAL que hace llamadas automáticas es `/api/watcher/check/route.js`:

```
Cron externo (cron-job.org)
    ↓
GET /api/watcher/check?secret=CRON_SECRET cada minuto
    ↓
Lee watchers activos de Supabase
    ↓
Para cada watcher:
  - Consulta Electromaps (datos REALES)
  - Compara con last_connector_states
  - Detecta OCCUPIED → FREE
  - Llama Twilio
  - Actualiza vigilancia a 'completed'
    ↓
Logs registran: "[v0] Test call initiated: CA..."
    ↓
Twilio hace llamada real al número
```

---

## RESUMEN FINAL

| Motor | Tipo | Fiabilidad | Automático | Notificación |
|-------|------|-----------|-----------|--------------|
| check-chargers.js | Cron (obsoleto) | ? | SÍ | Twilio |
| telegram-webhook | Manual Telegram | ✅ | NO | Telegram |
| watcher/check | Cron automático | ✅ | SÍ | Twilio |

**El motor Telegram es fiable COMO CONTROL MANUAL, pero no es el responsable de las notificaciones automáticas. Es un control de prueba (test_connectors).**

**El motor real es Watcher, que funciona en Production normalmente.**
