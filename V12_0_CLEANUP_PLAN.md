# V12.0 RC1 - CLEANUP & CONSOLIDATION PLAN

## Estado Actual
- Versión: V12.0 RC1 (Release Candidate)
- Rama activa: `v0/3volution-1984-bc05568e`
- Status Production: ✅ Estable
- Llamadas automáticas: ⏳ Pendiente confirmación

---

## CLASIFICACIÓN: ENDPOINTS TEMPORALES

### ✅ MANTENER (Producción)
```
app/api/monitoring/route.js          - Monitoreo de estaciones
app/api/monitoring/[id]/route.js     - Detalle de estación
app/api/monitoring/active/route.js   - Estaciones activas
app/api/watcher/route.js             - Crear vigilancias
app/api/watcher/check/route.js       - Ejecutar chequeo (cron)
app/api/stations/route.js            - Listar estaciones
app/api/telegram-webhook/route.js    - Webhook de Telegram
app/api/twilio/test-call/route.js    - Prueba de Twilio
app/api/cron/check-chargers.js       - Cron legacy (referencia)
```

### ⏳ MANTENER TEMPORALMENTE (Diagnóstico RC1)
```
app/api/debug/env/route.js          - Verificar variables env (KEEP)
app/api/watcher/diagnose/route.js   - Diagnosticar watcher (KEEP)
app/api/logs/route.js               - Ver logs (KEEP)
app/api/state-changes/route.js      - Ver cambios de estado (KEEP)
app/api/status/route.js             - Ver status (KEEP)
```

### 🗑️ ELIMINAR DESPUÉS DE V12.0 (Post-Release)
```
NINGUNO - Todos los endpoints temporales serán útiles para troubleshooting
```

---

## CLASIFICACIÓN: LOGGING [v0]

### ✅ MANTENER (Producción)
```
app/api/twilio/test-call/route.js
  - [v0] Test call initiated
  - [v0] Error making test call

app/api/watcher/check/route.js
  - [v0] Watcher check - iniciado
  - [v0] Conector X liberado
  - [v0] Llamada Twilio enviada
```

### ⏳ REDUCIR DESPUÉS DE V12.0.0
```
app/api/watcher/check/route.js     - Logging granular (SIMPLIFICAR después)
app/api/watcher/route.js           - Logging granular (SIMPLIFICAR después)
app/services/notification-service  - Logging granular (SIMPLIFICAR después)
```

---

## CLASIFICACIÓN: DOCUMENTACIÓN

### ✅ MANTENER (Core)
```
ARCHITECTURE.md            - Arquitectura del proyecto
CRON_SETUP.md             - Cómo configurar el cron
DATABASE_SCHEMA.md        - Schema de BD
README.md                 - Documentación principal
DEPLOYMENT.md             - Guía de deployment
```

### 🗑️ ELIMINAR DESPUÉS DE V12.0.0
```
V11_3_DESIGN.md
V11_3_FINAL_IMPLEMENTATION.md
V11_3_FINAL_PROPOSAL.md
V11_3_IMPLEMENTATION_SUMMARY.md
V11_3_TEST_PLAN.md
V11_3_VALIDATION_GUIDE.md
V11_3_VERCEL_SETUP.md
V11_3_VERIFICATION_CHECKLIST.md
DEBUGGING_TWILIO_VARS.md
DIAGNOSTICO_PREVIEW_INSTRUCCIONES.md
TECHNICAL_AUDIT.md
TWILIO_DIAGNOSTIC_REPORT.md
WATCHER_FLOW_AUDIT.md
V12_0_CLEANUP_PLAN.md (este archivo)
```

---

## CLASIFICACIÓN: GIT BRANCHES

### ✅ MANTENER
```
origin/main                              - Production branch
origin/v0/3volution-1984-bc05568e       - RC1 (merge candidate)
```

### 🗑️ ELIMINAR DESPUÉS DE MERGE
```
v0/3volution-1984-bc05568e (local)      - Borrar después del merge a main
origin/v0/3volution-1984-bc05568e       - Eliminar rama remota post-release
```

---

## CLASIFICACIÓN: VARIABLES DE ENTORNO

### ✅ MANTENER (Producción)
```
TWILIO_ACCOUNT_SID        - Credenciales Twilio
TWILIO_AUTH_TOKEN         - Credenciales Twilio
TWILIO_PHONE_NUMBER       - Número desde el cual hace llamadas
TWILIO_CALL_RECIPIENT     - Número destino de llamadas
ELECTROMAPS_USER          - API Electromaps
ELECTROMAPS_PASS          - API Electromaps
TELEGRAM_BOT_TOKEN        - Bot Telegram
TELEGRAM_CHAT_ID          - Chat Telegram
SUPABASE_URL              - Base de datos
SUPABASE_ANON_KEY         - BD anon
SUPABASE_SERVICE_ROLE_KEY - BD admin
CRON_SECRET               - Secret para cron
```

### ⏳ MANTENER TEMPORALMENTE (RC1 Testing)
```
NONE - Todas las variables son necesarias
```

---

## PRÓXIMAS ACCIONES (SECUENCIA)

### ✅ COMPLETADO
- [x] Auditoría completa del código
- [x] Verificación Production vs Preview
- [x] Diagnóstico completo de flujo Twilio
- [x] Confirmación de endpoints operativos

### ⏳ PENDIENTE (RC1)
- [ ] Confirmar UNA llamada automática real (OCCUPIED→FREE)
- [ ] Esperar confirmación del usuario

### 📋 POST-CONFIRMACIÓN (v12.0.0 Release)
- [ ] Crear tag `v12.0.0` en git
- [ ] Merge a `main` (con --no-ff para mantener historial)
- [ ] Eliminar rama feature `v0/3volution-1984-bc05568e`
- [ ] Eliminar documentación V11.3
- [ ] Simplificar logging granular

### 🔧 POST-RELEASE (v12.0.1+)
- [ ] Refactor logging a estándares simples
- [ ] Consolidar endpoints diagnostico en panel único
- [ ] Optimización de queries Supabase

---

## COMMITS PREPARADOS (No hacer merge todavía)

Total commits desde branch feature: **24 commits**

**Últimos 5 commits:**
```
c52265e - DEBUG: Add env var checker endpoint at /api/debug/env
224f8d1 - TEMP: Granular error instrumentation with stage tracking in watcher endpoint
5377bb5 - FIX: Add ES6 exports to electromaps.js to fix import in watcher endpoints - resolves 500 error
...
```

**Cambios principales:**
- ✅ Watcher creación y chequeo operativos
- ✅ Twilio integración completa
- ✅ Logging granular para debugging
- ✅ Endpoints temporales para diagnostico
- ✅ Electromaps importación corregida

---

## VERIFICACIÓN FINAL (Checklist RC1)

- [x] Twilio test-call funciona en Production
- [x] Variables Twilio llegan al runtime
- [x] Watchers se crean correctamente
- [x] Detección OCCUPIED→FREE funciona
- [x] Telegram notificaciones funcionan
- [ ] Llamada automática Twilio confirmada (PENDIENTE)

---

## NOTAS

- **No eliminar todavía:** `/api/debug/env`, `/api/watcher/diagnose`, logging `[v0]`
- **Razón:** Necesarios para confirmar llamada automática y troubleshooting
- **Fecha objetivo v12.0.0:** Cuando se confirme UNA llamada automática real
- **Riesgo:** Bajo - Production ya estable, cambios solo de limpieza

---

## ROLLBACK PLAN (Si es necesario)

Si algo falla post-confirmación:
```bash
git revert HEAD --no-edit          # Revierte último merge
git push origin main                # Pushea revert a production
```

Todos los cambios están bien testeados, rollback es seguro.
