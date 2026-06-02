# V11.3 DESIGN — Twilio Watcher MVP Completo

---

## 1. CLARIFICACIÓN: VARIABLES DE ENTORNO TWILIO

### Variables actuales en el proyecto:

| Variable | Tipo | Propósito | Ubicación | Ejemplo |
|----------|------|----------|-----------|---------|
| `TWILIO_ACCOUNT_SID` | Credencial | ID de cuenta Twilio | notification-service.js:8 | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Credencial | Token de autenticación | notification-service.js:9 | `auth_token_secret` |
| `TWILIO_PHONE_NUMBER` | **ORIGEN** | Número de teléfono DESDE el cual hace llamadas Twilio | notification-service.js:20 | `+34607373373` |

### ¿Número destino?

**NO EXISTE** variable de entorno para número destino. Razones:
- Sistema antiguo: número destino viene en `charger_monitoring.phone_number`
- Sistema nuevo (watcher): no hay número almacenado

### Solución MVP propuesta:

**Crear variable de entorno `TWILIO_CALL_RECIPIENT`** con el número destino de las vigilancias.

| Variable | Tipo | Propósito | Nuevo |
|----------|------|----------|-------|
| `TWILIO_CALL_RECIPIENT` | Número | Destino global para llamadas automáticas del watcher | ✅ SÍ |

### Conceptos finales:

```
TWILIO_PHONE_NUMBER = "De quién" son las llamadas (número origen/tuyo de Twilio)
TWILIO_CALL_RECIPIENT = "A quién" van las llamadas (número destino/tuyo personal)
```

---

## 2. FLUJO COMPLETO E2E — UI → Twilio → Completed

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         V11.3 E2E FLOW                                   │
└──────────────────────────────────────────────────────────────────────────┘

PASO 1: Usuario abre modal de vigilancia
╔════════════════════════════════════════════════════════════════════════╗
║ app/monitor/page.tsx                                                   ║
║ User clicks "Vigilar" button                                           ║
║ → Abre WatcherModal con station data                                   ║
╚════════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
PASO 2: Usuario activa vigilancia
╔════════════════════════════════════════════════════════════════════════╗
║ app/components/WatcherModal.tsx                                        ║
║ User ingresa código "NACHO" y pulsa "Iniciar vigilancia"              ║
║ → Llama POST /api/watcher                                              ║
╚════════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
PASO 3: API crea vigilancia
╔════════════════════════════════════════════════════════════════════════╗
║ app/api/watcher/route.js (POST)                                        ║
║                                                                        ║
║ 1. Verifica vigilancia activa previa: SELECT status='active'           ║
║ 2. Consulta Electromaps: obtenerDatosEstacion(station_id)              ║
║ 3. Valida hay conectores: if conectores.length === 0 → error 503      ║
║ 4. Valida hay cargadores ocupados: if hayLibre → error 422             ║
║ 5. Crea snapshot: last_connector_states = {id: status, ...}            ║
║ 6. DELETE filas anteriores con status != 'active'                      ║
║ 7. INSERT new watcher:                                                 ║
║    ├─ station_id                                                       ║
║    ├─ station_name                                                     ║
║    ├─ last_connector_states (snapshot JSONB)                           ║
║    ├─ status = 'active'                                                ║
║    └─ retry_count = 0                                                  ║
║                                                                        ║
║ 200 OK { watcher_id, status: 'active' }                                ║
╚════════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
PASO 4: Modal se cierra, UI marca estación como vigilada
╔════════════════════════════════════════════════════════════════════════╗
║ app/monitor/page.tsx                                                   ║
║ activeWatchers[station.id] = true                                      ║
║ → UI: fondo amarillo + etiqueta "Vigilancia activa"                    ║
║ → Botón "Vigilar" → "Ver vigilancia"                                   ║
╚════════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
PASO 5: Cron externo (cron-job.org) invoca check cada minuto
╔════════════════════════════════════════════════════════════════════════╗
║ Cada 60 segundos durante ~8 horas o hasta que se complete              ║
║ GET https://tuapp.com/api/watcher/check?secret=CRON_SECRET             ║
╚════════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
PASO 6: Endpoint check evalúa vigilancias
╔════════════════════════════════════════════════════════════════════════╗
║ app/api/watcher/check/route.js (GET)                                   ║
║                                                                        ║
║ 1. Autentica: if secret !== CRON_SECRET → 401                         ║
║ 2. SELECT * FROM active_watchers WHERE status='active'                 ║
║ 3. Para cada vigilancia:                                               ║
║    │                                                                   ║
║    ├─ Consulta Electromaps: currentStates = obtenerDatosEstacion()    ║
║    ├─ Compara vs watcher.last_connector_states                         ║
║    └─ ¿Hay transición OCCUPIED → FREE?                                ║
║       │                                                               ║
║       ├─ SÍ (cambio detectado):                                        ║
║       │  ├─ await sendNotification(                                    ║
║       │  │   process.env.TWILIO_CALL_RECIPIENT,  ◄─ DESTINO         ║
║       │  │   watcher.station_name                                      ║
║       │  │ )                                                           ║
║       │  │  [Twilio hace llamada real]                                 ║
║       │  │                                                             ║
║       │  ├─ ¿Llamada exitosa? (result.success === true)              ║
║       │  │  ├─ SÍ:                                                    ║
║       │  │  │  └─ UPDATE active_watchers                              ║
║       │  │  │     SET status='completed'                              ║
║       │  │  │     WHERE id=watcher.id                                 ║
║       │  │  │  → Vigilancia desaparece de check próxima iteración    ║
║       │  │  │                                                         ║
║       │  │  └─ NO (error Twilio):                                     ║
║       │  │     ├─ INCREMENT retry_count                               ║
║       │  │     ├─ if retry_count >= 5:                                ║
║       │  │     │  └─ UPDATE status='failed'  (abandona reintentos)    ║
║       │  │     └─ else: espera próximo ciclo (max 5 minutos total)    ║
║       │  │                                                             ║
║       │  └─ Log de auditoría                                           ║
║       │                                                               ║
║       └─ NO (sin cambio):                                              ║
║          ├─ UPDATE last_connector_states = currentStates               ║
║          │ (preserva el timestamp de cambio real)                      ║
║          └─ Continuamos esperando próximo ciclo                        ║
║                                                                        ║
║ 200 OK { success: true, checked: N, calls_made: M }                    ║
╚════════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
PASO 7: UI actualiza cada 30s
╔════════════════════════════════════════════════════════════════════════╗
║ app/monitor/page.tsx (useEffect polling)                               ║
║ GET /api/watcher                                                       ║
║ activeWatchers = {station_id: true, ...}  solo status='active'        ║
║                                                                        ║
║ Si status='completed':                                                 ║
║ → Desaparece del objeto → UI vuelve a gris → "Vigilar" disponible      ║
╚════════════════════════════════════════════════════════════════════════╝
```

---

## 3. DISEÑO VISUAL — Bloque de Prueba Twilio en Modal

### Ubicación en WatcherModal.tsx:

```
┌──────────────────────────────────────────────────────────┐
│  MODAL: Vigilancia de Estación "MÉRIDA"                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Código de confirmación:                                 │
│  [input: NACHO _______________]                          │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  ✓ SECCIÓN DE PRUEBA TWILIO (NUEVA)                      │
│                                                          │
│  Verificar llamada Twilio:                              │
│                                                          │
│  Número destino:                                        │
│  +34 [607373373            ]                             │
│      [Usar configurado por defecto]                      │
│                                                          │
│  [ Probar Llamada ]  [Mostrar resultado]                 │
│                                                          │
│  [Resultado en tiempo real]:                             │
│  ┌────────────────────────────────────────┐             │
│  │ (vacío hasta probar)                   │             │
│  │                                        │             │
│  │ Cuando se pulsa "Probar":               │             │
│  │ ┌────────────────────────────────────┐ │             │
│  │ │ Iniciando llamada...               │ │             │
│  │ └────────────────────────────────────┘ │             │
│  │                                        │             │
│  │ Después de 5s:                         │             │
│  │ ┌────────────────────────────────────┐ │             │
│  │ │ ✓ Llamada iniciada correctamente   │ │             │
│  │ │ SID: CA123456789abc...             │ │             │
│  │ │ Recibe en: +34 607373373           │ │             │
│  │ └────────────────────────────────────┘ │             │
│  │                                        │             │
│  │ O si falla:                             │             │
│  │ ┌────────────────────────────────────┐ │             │
│  │ │ ✗ Error en Twilio:                 │ │             │
│  │ │ "Invalid phone number"              │ │             │
│  │ └────────────────────────────────────┘ │             │
│  └────────────────────────────────────────┘             │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  [ Cancelar ]  [ Iniciar Vigilancia ]                    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Comportamiento:

1. **Campo número destino:**
   - Por defecto: valor de `TWILIO_CALL_RECIPIENT` (formato visual: `+34 607373373`)
   - Usuario puede editarlo para probar otro número
   - No afecta la vigilancia real (que usa la variable de entorno)

2. **Botón "Probar Llamada":**
   - POST `/api/twilio/test-call` con número ingresado
   - Reutiliza exactamente la misma función `sendTwilioCall` del watcher
   - Resultado aparece debajo en 2-3 segundos

3. **Resultado:**
   - Éxito: verde + "Llamada iniciada correctamente" + SID
   - Error: rojo + mensaje de error Twilio

4. **Permanencia:**
   - Siempre visible mientras el modal está abierto
   - No requiere activar vigilancia
   - Se puede probar múltiples veces

---

## 4. VARIABLES DE ENTORNO NECESARIAS

| Variable | Obligatoria | Descripción | Ejemplo |
|----------|-------------|-------------|---------|
| `TWILIO_ACCOUNT_SID` | ✅ | ID de cuenta Twilio | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | ✅ | Token de auth Twilio | `auth_token_xxxxx` |
| `TWILIO_PHONE_NUMBER` | ✅ | Número desde el cual llama Twilio | `+34607373373` |
| `TWILIO_CALL_RECIPIENT` | ✅ | Número destino para vigilancias (NUEVO) | `+34607373373` |
| `CRON_SECRET` | ✅ | Token para autorizar cron externo | `secret_xxxxx` |

---

## 5. ARCHIVOS A MODIFICAR

| Archivo | Cambios | Líneas | Severidad |
|---------|---------|--------|-----------|
| `app/api/watcher/check/route.js` | Cambiar sendNotification(message) a sendNotification(process.env.TWILIO_CALL_RECIPIENT, watcher.station_name) | 111 | CRÍTICO |
| `app/components/WatcherModal.tsx` | Añadir sección de prueba Twilio con input y botón | +80 líneas | NUEVA FEATURE |
| `app/api/twilio/test-call/route.js` | Existente - reutilizar su lógica, no modificar | — | REUTILIZAR |
| `.env.example` | Crear con todas las variables | +12 líneas | NUEVO |
| `README.md` | Añadir sección "Configuración de vigilancias y Twilio" | +30 líneas | DOCUMENTACIÓN |
| `app/config/version.ts` | Actualizar a V11.3 | 1 | VERSION |

### Archivos que NO se modifican:
- `app/api/watcher/route.js` — ya funciona bien
- `app/services/notification-service.js` — firma correcta, solo hay que llamarla bien
- `scripts/create-active-watchers-table.sql` — sin cambios (no añade phone_number)
- `app/monitor/page.tsx` — sin cambios

---

## 6. PRUEBA FUNCIONAL PROPUESTA

**Antes de desplegar:**

```
1. Configurar variables de entorno:
   TWILIO_PHONE_NUMBER=+34XXXXXXXXXX (tu número Twilio)
   TWILIO_CALL_RECIPIENT=+34XXXXXXXXXX (número personal destino)
   CRON_SECRET=tu_cron_secret

2. Abrir modal de vigilancia

3. En sección "Prueba Twilio":
   - Número destino debe mostrarse: +34 (últimos 9 dígitos)
   - Pulsar "Probar Llamada"
   - Debe recibir llamada en el teléfono
   - Resultado: verde con SID

4. Activar vigilancia (código NACHO)

5. Ocupar cargador via Telegram: /ocupar 003649

6. Liberar cargador via Telegram: /liberar 003649

7. Simular cron manual:
   GET https://tuapp.com/api/watcher/check?secret=tu_cron_secret

8. Debe recibir llamada Twilio automática en teléfono

9. Verificar BD:
   SELECT * FROM active_watchers WHERE station_id='...'
   → status debe ser 'completed'
```

---

## RESUMEN PROPUESTO PARA V11.3

✅ **Funcionalidad:** Llamada Twilio real de extremo a extremo con vigilancia
✅ **Herramienta de diagnóstico:** Prueba Twilio dentro del modal
✅ **Sin cambios de BD:** Solo variable de entorno nueva
✅ **Mantenible:** Código reutilizable y documentado
✅ **Escalable:** Preparado para futura multiusuario en V12

**Total cambios:** 5 archivos, ~100 líneas netas
**Tiempo implementación:** ~2 horas
**Riesgo:** BAJO — cambios mínimos y aislados
