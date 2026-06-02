# AUDITORÍA TÉCNICA - ARCHITECTURE MAP GUARDIAN 24/7

**Versión:** V11.2  
**Fecha:** 2026-06-02  

## 1. INTEGRACIÓN ELECTROMAPS

**Objetivo:** Consultar estado real de cargadores en estaciones específicas.

**Archivos:** api/electromaps.js, app/api/stations/route.js, api/monitor.js, app/api/watcher/*

**Tablas:** charger_state, connector_state_changes, connector_timestamps, test_connectors

**ERRORES IDENTIFICADOS:**
- ❌ Login Cognito en CADA consulta sin cache (latencia innecesaria)
- ❌ Filtrado manual hardcodeado de conectores por estación (no escalable)
- ❌ Status inconsistente: 'FREE' vs 'AVAILABLE' (comparaciones frágiles)
- ⚠️ Sin validación si Electromaps retorna array vacío
- 🔴 **Riesgo: Fallo Electromaps = aplicación sin datos**

---

## 2. SISTEMA HISTÓRICO DE CAMBIOS

**Objetivo:** Registrar cambios de estado con duraciones precisas.

**Tablas:** connector_state_changes (auditoría), connector_timestamps (sin usar)

**ERRORES IDENTIFICADOS:**
- ⚠️ V10.x: status_changed_at se sobrescribía cada ciclo (FIJO en V11.2)
- ❌ Duraciones ~60s en datos antiguos (irrecuperables)
- ❌ Duraciones dependen de JSONB frágil
- ❌ connector_timestamps definida pero NUNCA USADA
- 🔴 **Riesgo: Datos históricos de duraciones son incorrectos**

---

## 3. SISTEMA DE VIGILANCIA (WATCHERS)

**Objetivo:** Detectar OCCUPIED→FREE y enviar notificación.

**Tablas:** active_watchers (7 meses después que charger_monitoring)

**ERRORES IDENTIFICADOS:**
- ✅ V11.1: Fija error de clave duplicada
- ✅ V11.1: Detecta si cargador YA FREE
- ✅ V11.1: Rechaza si Electromaps devuelve vacío
- ⚠️ Cognito auth en /api/watcher/check puede fallar → sin vigilancia
- 🔴 **Riesgo: Cron externo (cron-job.org) es SPoF**

---

## 4. TWILIO

**Objetivo:** Llamadas de voz para alertas.

**Archivos:** app/services/notification-service.js, app/api/twilio/test-call/route.js

**ERRORES IDENTIFICADOS:**
- ⚠️ Sin validación de phoneNumber
- ⚠️ Sin log de llamadas en BD
- ❌ Mensaje en español sin especificar voice language
- ⚠️ Sin reintentos internos (solo en watcher/check con max 5)

---

## 5. TELEGRAM BOT

**Objetivo:** Controlar cargadores de prueba via /ocupar, /liberar, /estado.

**Archivos:** app/api/telegram-webhook/route.js

**ERRORES IDENTIFICADOS:**
- 🔴 **CRÍTICO: CARGADORES_FICTICIOS undefined → crash en /estado**
- ❌ Mapeo hardcodeado de IDs (no escalable)
- ❌ DELETE+INSERT en lugar de UPDATE
- ⚠️ Sin validación de connector_id

---

## 6. CRON

**Objetivo:** Ejecutar tasks periódicamente.

**Vercel Cron:** `/api/cron/check-chargers` cada 24h (limitación Hobby)

**Cron Externo:** `/api/watcher/check` debe ser cada 1 minuto (vía cron-job.org)

**ERRORES IDENTIFICADOS:**
- 🔴 **CRÍTICO: Cron externo NO documentado para usuario**
- ❌ Setup manual sin verificación
- ❌ Sin health checks
- ❌ Sin timeout handling

---

## 7. VARIABLES DE ENTORNO

**Requeridas:**
- ELECTROMAPS_USER, ELECTROMAPS_PASS
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
- TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
- CRON_SECRET

**ERRORES IDENTIFICADOS:**
- ❌ Sin .env.example
- ❌ Sin validación en startup
- ⚠️ Valores hardcodeados en algunos lugares

---

## 8. DASHBOARD PRINCIPAL

**Objetivo:** Mostrar estado en tiempo real de estaciones y cargadores.

**Archivos:** app/monitor/page.tsx, app/page.tsx (redirect), componentes WatcherModal/MonitoringModal

**Features:**
- ✅ Vigilancia activa (amarillo)
- ✅ Estadísticas por estación
- ✅ Histórico de cambios

---

## 9. ESTADÍSTICAS & REPORTES

**Funcionalidad:** /api/state-changes retorna historial con duraciones

**ERRORES IDENTIFICADOS:**
- ⚠️ Duraciones V10 incorrectas (~60s)
- ⚠️ Algunos registros sin timestamp válido

---

## 10. LOGS

**Tabla:** logs (referenciada en /api/logs/route.js pero tabla NO existe)

**ERRORES IDENTIFICADOS:**
- 🔴 **CRÍTICO: Tabla "logs" no definida en SQL**
- ❌ /api/logs devuelve error 500
- ⚠️ Sin captura de eventos del sistema

---

## 11. SISTEMA DE PRUEBAS

**Archivos:** test-monitor.js (nunca ejecutado en CI/CD)

**ERRORES IDENTIFICADOS:**
- ❌ Sin tests automatizados en CI/CD
- ⚠️ test-monitor.js existe pero nunca se ejecuta

---

## MATRIZ DE RIESGOS

### 🔴 CRÍTICOS (resolver YA)
1. Cron externo NO documentado
2. CARGADORES_FICTICIOS undefined → crash Telegram
3. Tabla logs no existe
4. Sin .env.example

### 🟡 ALTOS (próximas 2 semanas)
1. Token Cognito sin cache (latencia)
2. Sin RLS en tablas
3. Cron externo es SPoF
4. Sin tests automatizados

### 🟢 MEDIOS (próximo mes)
1. Reconstruir duraciones históricas (análisis)
2. Activar connector_timestamps
3. Documentar flujos completos
