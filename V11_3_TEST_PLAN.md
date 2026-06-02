# V11.3 - PLAN DE TESTING FUNCIONAL EXHAUSTIVO

## 1. PRUEBAS UNITARIAS - Twilio Connection

### Test 1.1: Credenciales configuradas correctamente
**Objetivo:** Verificar que Twilio puede establecer conexión con las credenciales en .env

**Paso a paso:**
```bash
curl -X POST http://localhost:3000/api/twilio/test-call \
  -H "Content-Type: application/json" \
  -d '{"action":"check-credentials"}'
```

**Resultado esperado:**
```json
{
  "status": "success",
  "message": "Credenciales Twilio válidas",
  "accountSid": "ACxxxxxxxx...",
  "phoneNumber": "+34607373373"
}
```

**Casos de error:**
- `TWILIO_ACCOUNT_SID` no definido → error 500 "TWILIO_ACCOUNT_SID not found"
- `TWILIO_AUTH_TOKEN` no definido → error 500 "TWILIO_AUTH_TOKEN not found"
- `TWILIO_PHONE_NUMBER` no definido → error 500 "TWILIO_PHONE_NUMBER not found"
- Token inválido → error 401 "Invalid credentials"

---

### Test 1.2: Número destino válido
**Objetivo:** Verificar que el número destino es un formato válido

**Paso a paso:**
```bash
curl -X POST http://localhost:3000/api/twilio/test-call \
  -H "Content-Type: application/json" \
  -d '{"action":"validate-recipient","phone":"+34612345678"}'
```

**Resultado esperado:**
```json
{
  "status": "valid",
  "number": "+34612345678",
  "country": "ES",
  "isValid": true
}
```

**Casos de error:**
- Número vacío → error 400 "Number required"
- Formato inválido (+34abc) → error 400 "Invalid phone format"
- País no soportado → error 400 "Country not supported"

---

## 2. PRUEBAS DE INTEGRACIÓN - Flujo Completo E2E

### Test 2.1: Botón "Probar Llamada" en WatcherModal
**Objetivo:** Verificar que el botón inicia una llamada Twilio real

**Pasos manuales:**
1. Abrir UI en http://localhost:3000/monitor
2. Pulsar botón "Vigilar" en una estación
3. En el modal, introducir código "NACHO"
4. En sección "Validar Twilio", pulsar botón "Probar Llamada"
5. Esperar 5 segundos
6. Recibir llamada en tu teléfono personal

**Evidencia a verificar:**
- El botón muestra spinner mientras carga
- Después de 1-2 segundos: "Llamada enviada a +34612345678"
- Recibir llamada real en el teléfono
- Message de Twilio: "Hola Nacho. Prueba de sistema."

**Casos de error:**
- Si credenciales inválidas: "Error: Credenciales Twilio no configuradas"
- Si teléfono destino no configurado: "Error: Número destino no definido"
- Si Twilio rechaza el número: "Error: Número inválido o no permitido"

---

### Test 2.2: Activación de vigilancia
**Objetivo:** Verificar que la vigilancia se crea correctamente en BD

**Pasos manuales:**
1. Abrir UI en http://localhost:3000/monitor
2. Pulsar "Vigilar" en estación "Estación Centro"
3. Introducir "NACHO"
4. Pulsar "Activar Vigilancia"
5. Esperar respuesta

**Evidencia a verificar:**
- Modal se cierra
- Estación pasa a color amarillo con etiqueta "Vigilancia activa"
- Botón cambia a "Ver vigilancia"
- En BD: `SELECT * FROM active_watchers WHERE status='active'` devuelve 1 fila

**En Supabase SQL:**
```sql
SELECT id, station_id, station_name, status, last_connector_states, retry_count 
FROM active_watchers 
WHERE status='active' 
ORDER BY created_at DESC 
LIMIT 1;
```

**Resultado esperado:**
```
id: 12345678-1234-1234-1234-123456789012
station_id: EST0001
station_name: Estación Centro
status: active
last_connector_states: {"connector_1": "OCCUPIED", "connector_2": "OCCUPIED"}
retry_count: 0
```

---

### Test 2.3: Detección OCCUPIED → FREE
**Objetivo:** Verificar que el sistema detecta correctamente la transición

**Pasos manuales:**
1. Tener vigilancia activa (Test 2.2 pasado)
2. Abrir Bot de Telegram
3. Enviar comando `/liberar 003657` (libera un cargador que era OCCUPIED)
4. Esperar 30 segundos (siguiente ciclo de polling del UI)
5. Verificar que el estado cambió

**Evidencia a verificar:**
- En BD: nuevo registro en `connector_state_changes`
```sql
SELECT connector_id, estado_anterior, estado_nuevo, tiempo_en_estado_anterior_segundos, timestamp
FROM connector_state_changes
WHERE connector_id='003657'
ORDER BY timestamp DESC
LIMIT 1;
```

**Resultado esperado:**
```
connector_id: 003657
estado_anterior: OCCUPIED
estado_nuevo: FREE
tiempo_en_estado_anterior_segundos: 1200  (≥ 60s, no ~60s)
timestamp: 2026-06-02 14:32:15+00
```

---

### Test 2.4: Llamada Twilio automática
**Objetivo:** Verificar que watcher/check detecta cambio y llama

**Pasos manuales:**
1. Simular invocación manual del cron:
```bash
curl -X GET "http://localhost:3000/api/watcher/check?secret=TU_CRON_SECRET"
```

2. Esperara 2-3 segundos
3. Recibir llamada en teléfono personal
4. Verificar en BD que status cambió a 'completed'

**Resultado esperado (respuesta HTTP):**
```json
{
  "success": true,
  "checked": 1,
  "calls_made": 1,
  "watchers_processed": [
    {
      "station_name": "Estación Centro",
      "connector_freed": "connector_1",
      "status": "completed",
      "retry_count": 0
    }
  ]
}
```

**Verificar en BD:**
```sql
SELECT status, retry_count FROM active_watchers WHERE station_id='EST0001';
```

**Resultado esperado:**
```
status: completed
retry_count: 0
```

---

## 3. PRUEBAS DE ERRORES - Casos de Fallo

### Test 3.1: Twilio sin credenciales
**Setup:** Eliminar `TWILIO_ACCOUNT_SID` de .env

**Paso a paso:**
1. Intentar activar vigilancia
2. Pulsar "Probar Llamada"
3. Simular GET `/api/watcher/check?secret=X`

**Resultado esperado en cada caso:**
- Activar vigilancia: `Status 500 - "TWILIO_ACCOUNT_SID not configured"`
- Probar Llamada: `Status 500 - "TWILIO_ACCOUNT_SID not configured"`
- watcher/check: `Status 500 - "TWILIO_ACCOUNT_SID not configured"`

---

### Test 3.2: Número destino inválido
**Setup:** En .env, usar `TWILIO_CALL_RECIPIENT=+3412345` (muy corto)

**Paso a paso:**
1. Pulsar "Probar Llamada"
2. Simular GET `/api/watcher/check?secret=X`

**Resultado esperado:**
- Probar Llamada: `Status 400 - "Invalid phone number format"`
- watcher/check: `Status 400 - "Invalid phone number format"`, `status` permanece `active`

---

### Test 3.3: Cron sin secret válido
**Setup:** Conocer el `CRON_SECRET` real en .env

**Paso a paso:**
```bash
curl -X GET "http://localhost:3000/api/watcher/check?secret=WRONG_SECRET"
```

**Resultado esperado:**
```json
{
  "error": "Unauthorized",
  "status": 401
}
```

---

### Test 3.4: Llamada Twilio falla (Retry Logic)
**Setup:** Usar número destino que Twilio rechaza: `+999999999999`

**Paso a paso:**
1. Activar vigilancia con `/vercel/share/v0-project/app/api/watcher/route.js` modificado temporalmente para usar número inválido
2. Simular GET `/api/watcher/check?secret=X` cinco veces seguidas
3. Verificar que retry_count llega a 5 y status pasa a 'failed'

**Verificar después de primer fallo:**
```sql
SELECT status, retry_count FROM active_watchers WHERE station_id='EST0001';
```
**Resultado:** `status: active, retry_count: 1`

**Verificar después del quinto fallo:**
```sql
SELECT status, retry_count FROM active_watchers WHERE station_id='EST0001';
```
**Resultado:** `status: failed, retry_count: 5`

---

### Test 3.5: Cancelación manual de vigilancia
**Objetivo:** Verificar que el usuario puede cancelar

**Pasos manuales:**
1. Estación en amarillo con "Vigilancia activa"
2. Pulsar botón "Ver vigilancia"
3. Modal: Pulsar "Cancelar vigilancia"
4. Introducir código "NACHO"
5. Confirmar

**Resultado esperado:**
- Modal se cierra
- Estación vuelve a gris
- En BD: `SELECT * FROM active_watchers WHERE station_id='EST0001'` devuelve `status='cancelled'`
- Botón vuelve a "Vigilar"

---

## 4. EVIDENCIA POST-DEPLOY VERIFICABLE POR EL USUARIO

### Checklist de verificación final

- [ ] Tabla `active_watchers` existe en Supabase con schema correcto
- [ ] Variables de entorno configuradas:
  - [ ] `TWILIO_ACCOUNT_SID`
  - [ ] `TWILIO_AUTH_TOKEN`
  - [ ] `TWILIO_PHONE_NUMBER`
  - [ ] `TWILIO_CALL_RECIPIENT`
  - [ ] `CRON_SECRET`
- [ ] Botón "Probar Llamada" en modal funciona
- [ ] Vigilancia activa se crea en BD
- [ ] Status_changed_at se preserva (no ~60s sino duración real)
- [ ] GET `/api/watcher/check?secret=X` devuelve JSON válido
- [ ] Llamada Twilio se recibe en el teléfono
- [ ] Status pasa de 'active' a 'completed' después de llamada exitosa
- [ ] Retry_count llega a 5 sin exceder (no continúa en 6, 7, 8...)
- [ ] Cancelación manual de vigilancia funciona

### Queries SQL de verificación post-deploy

```sql
-- Verificar tabla existe
SELECT * FROM active_watchers LIMIT 1;

-- Verificar estructura
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name='active_watchers' 
ORDER BY ordinal_position;

-- Verificar vigilancia activa
SELECT * FROM active_watchers WHERE status='active' ORDER BY created_at DESC LIMIT 5;

-- Verificar completed
SELECT * FROM active_watchers WHERE status='completed' ORDER BY created_at DESC LIMIT 5;

-- Verificar failed con retry_count=5
SELECT * FROM active_watchers WHERE status='failed' AND retry_count=5;

-- Verificar cambios de estado detectados
SELECT connector_id, estado_anterior, estado_nuevo, tiempo_en_estado_anterior_segundos 
FROM connector_state_changes 
WHERE CAST(tiempo_en_estado_anterior_segundos AS INT) > 300
ORDER BY timestamp DESC LIMIT 10;
```

---

## 5. CRITERIOS DE ACEPTACIÓN PARA MERGE A V11.3

✅ **DEBE cumplir todos estos criterios:**
1. Todos los tests unitarios (1.1, 1.2) pasan sin errores
2. Flujo E2E completo (2.1, 2.2, 2.3, 2.4) funciona de extremo a extremo
3. Todos los casos de error (3.1-3.5) son capturados y muestran mensajes claros
4. El usuario puede ejecutar las 4 queries SQL finales y ver datos correctos
5. `tiempo_en_estado_anterior_segundos` refleja duración real (≥60s, no ~60s)
6. Retry logic se detiene en 5 intentos (no continúa indefinidamente)
7. SIN debug logs en producción (remover todos `console.log("[v0]...")`)
8. `.env.example` documenta todas las variables necesarias
9. README incluye guía de configuración de cron externo

---

## 6. TIMELINE ESTIMADO

| Fase | Tiempo |
|------|--------|
| Tests unitarios (1-2) | 10 minutos |
| Tests integración E2E (3-5) | 30 minutos |
| Tests de error (10-30) | 20 minutos |
| Validación post-deploy | 15 minutos |
| **TOTAL** | **75 minutos** |

---

**IMPORTANTE:** No hacer commit/PR/merge sin haber ejecutado todos estos tests y confirmado que pasan.
