# DIAGRAMA DEL FLUJO: HISTORIAL DE CARGAS

## Flujo Completo (Tiempo Real)

```
┌─────────────────────────────────────────────────────────────────┐
│ CRON SCHEDULER EXTERNO (cada 1 minuto)                          │
│ GET /api/watcher/check?secret=<CRON_SECRET>                     │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ /api/watcher/check/route.js                                     │
│                                                                  │
│  1. Valida secret                                               │
│     └─ Si incorrecto → 401 Unauthorized, EXIT                   │
│                                                                  │
│  2. Lee active_watchers (status='active')                       │
│     └─ Si vacío → 200 OK, checked=0, EXIT                       │
│                                                                  │
│  3. Para CADA vigilancia activa:                                │
│     │                                                            │
│     ├─ Consulta Electromaps (obtenerDatosEstacion)              │
│     │  └─ Si error/vacío → LOG ERROR, continua con siguiente   │
│     │                                                            │
│     ├─ Compara estado actual vs previousStates                  │
│     │                                                            │
│     ├─ ¿OCCUPIED → FREE/AVAILABLE?                             │
│     │  │                                                         │
│     │  YES ─────────────────────────────────────────┐          │
│     │  │                                             │          │
│     │  └──→ 1️⃣  INSERT chargeHistory ✓             │          │
│     │       connectorId, station, started, ended,  │          │
│     │       durationMinutes, isOverLimit            │          │
│     │                                             │          │
│     │  └──→ 2️⃣  INSERT connector_state_changes    │          │
│     │       ❌ ERROR SILENCIOSO AQUÍ               │          │
│     │       (log pero no detiene ejecución)        │          │
│     │                                             │          │
│     │  └──→ 3️⃣  Busca alerta 'ringing' activa     │          │
│     │       Si existe → SKIP (gestiona StatusCB)  │          │
│     │       Si NO existe:                         │          │
│     │         ├─ Lanza Twilio call attempt 1     │          │
│     │         └─ INSERT watcher_call_events       │          │
│     │                                             │          │
│     NO ────────────────────────────────────────────┘          │
│     │                                                           │
│     └─ UPDATE active_watchers (last_connector_states)           │
│                                                                  │
│  4. Devuelve 200 OK { success, checked, calls_made }            │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ DATOS EN SUPABASE                                                │
│                                                                  │
│ Tabla: chargeHistory         ✓ Tiene datos                      │
│ Tabla: connector_state_changes ❓ Puede estar vacía (ERROR)     │
│ Tabla: watcher_call_events   ✓ Tiene alerts                     │
│ Tabla: active_watchers       ✓ Actualizado                      │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ MONITOR /monitor/page.tsx (refresh cada 30 segundos)            │
│                                                                  │
│ fetch('/api/state-changes?limit=10000')                         │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ /api/state-changes/route.js                                     │
│                                                                  │
│  1. Lee connector_state_changes (últimos 10,000)                │
│  2. Ordena por timestamp DESC (más recientes primero)           │
│  3. Formatea respuesta (mapea campos)                           │
│  4. Devuelve JSON                                               │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Monitor /app/monitor/page.tsx (línea 150-212)                   │
│                                                                  │
│ PROCESA:                                                         │
│  1. Empareja eventos: OCCUPIED (i) + FREE (j>i) = 1 carga      │
│  2. Deduplica: connector + fecha + hora = key único            │
│  3. Ordena: más reciente primero                               │
│  4. Filtra: últimos 30 días                                     │
│  5. Calcula:                                                     │
│     - Cargas hoy (desde 00:00 UTC)                              │
│     - Sancionables (> 120 min)                                  │
│     - Ocupación %                                                │
│                                                                  │
│ RENDERIZA:                                                       │
│  - Tab "Historial de Cargas"                                    │
│  - Tabla con: connector, estación, inicio, fin, duración       │
│  - Estadísticas (totales, sancionables, ocupación)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Puntos Críticos (donde se puede romper)

```
CRON SCHEDULER
      │
      └─ ¿EJECUTA cada minuto?
         NO  ──→ 🔴 PUNTO 1: Sin actividad en chargeHistory
         YES ──→ ✓
                 │
                 ├─ ¿Hay vigilancias activas (active_watchers)?
                 │  NO  ──→ 🟡 Sin detección (esperado si no activas)
                 │  YES ──→ ✓
                 │         │
                 │         ├─ ¿Se conecta Electromaps?
                 │         │  NO  ──→ 🔴 PUNTO 2: Early exit
                 │         │  YES ──→ ✓
                 │         │         │
                 │         │         ├─ ¿Detecta OCCUPIED→FREE?
                 │         │         │  NO  ──→ 🟡 Sin liberaciones (esperado)
                 │         │         │  YES ──→ ✓
                 │         │         │         │
                 │         │         │         ├─ ✓ INSERT chargeHistory
                 │         │         │         │
                 │         │         │         ├─ ❌ INSERT connector_state_changes
                 │         │         │         │   ERROR SILENCIOSO
                 │         │         │         │   🔴 PUNTO 3: ERROR CRÍTICO
                 │         │         │         │
                 │         │         │         └─ Monitor NO muestra datos
                 │         │         │            (chargeHistory ≠ connector_state_changes)
```

---

## Tabla de Campos por Tabla

### chargeHistory (escriben: /api/watcher/check)

| Campo | Tipo | Ejemplo | Línea |
|-------|------|---------|-------|
| id | uuid | auto | auto |
| connector_id | string | "003657" | 107 |
| station_id | string | "828524" | 108 |
| station_name | string | "Avda. Roma" | 109 |
| started_at | timestamp | "2026-07-02T10:30:00Z" | 110 |
| ended_at | timestamp | "2026-07-02T12:00:00Z" | 111 |
| timestamp | timestamp | "2026-07-02T12:00:00Z" | 112 |
| durationMinutes | integer | 90 | 113 |
| isOverLimit | boolean | false | 114 |
| isCompleted | boolean | true | 115 |
| created_at | timestamp | auto | auto |

### connector_state_changes (escriben: /api/watcher/check)

| Campo | Tipo | Ejemplo | Línea |
|-------|------|---------|-------|
| id | bigint | auto | auto |
| connector_id | string | "003657" | 121 |
| station_id | string | "828524" | 122 |
| station_name | string | "Avda. Roma" | 123 |
| estado_anterior | string | "OCCUPIED" | 124 |
| estado_nuevo | string | "FREE" | 125 |
| fecha | string | "2026-07-02" | 126 |
| dia | string | "Miércoles" | 127 |
| hora | string | "12:00:00" | 128 |
| timestamp | timestamp | "2026-07-02T12:00:00Z" | 129 |
| tiempo_en_estado_anterior_segundos | integer | 5400 | 130 |

---

## Línea de Tiempo de un Cambio Exitoso

```
T+0:00    Cron scheduler ejecuta: GET /api/watcher/check?secret=...
│
T+0:10    Detecta: connector 003657 pasó de OCCUPIED → FREE
│
T+0:20    ✓ INSERT chargeHistory (fila #12345)
│
T+0:30    ✓ INSERT connector_state_changes (fila #67890)  ← puede fallar silenciosamente
│
T+0:40    ✓ Busca alerta ringing (no existe)
│
T+0:50    ✓ Lanza llamada Twilio (CallSID: CA123456789)
│
T+1:00    ✓ INSERT watcher_call_events (fila #999)
│
T+30:00   Monitor fetch('/api/state-changes?limit=10000')
│
T+30:10   /api/state-changes lee 10,000 filas de connector_state_changes
│         (Línea #67890 está aquí ✓)
│
T+30:20   Monitor procesa: empareja, deduplica, filtra 30 días
│
T+30:30   Monitor renderiza: fila #67890 aparece en "Historial de Cargas"
└─ ✓ ÉXITO
```

---

## Línea de Tiempo si FALLA connector_state_changes

```
T+0:00    Cron scheduler ejecuta: GET /api/watcher/check?secret=...
│
T+0:10    Detecta: connector 003657 pasó de OCCUPIED → FREE
│
T+0:20    ✓ INSERT chargeHistory (fila #12345) ← ÉXITO, se guarda
│
T+0:30    ❌ INSERT connector_state_changes FALLA
│         Error: "permission denied" / "constraint violation" / etc.
│         console.error() loguea el error pero continúa
│
T+0:40    ✓ Busca alerta ringing (no existe)
│
T+0:50    ✓ Lanza llamada Twilio (CallSID: CA123456789)
│
T+1:00    ✓ INSERT watcher_call_events (fila #999)
│
T+30:00   Monitor fetch('/api/state-changes?limit=10000')
│
T+30:10   /api/state-changes lee 10,000 filas de connector_state_changes
│         (Línea #67890 NO ESTÁ porque no se insertó) ❌
│
T+30:20   Monitor procesa: nada que procesar
│
T+30:30   Monitor renderiza: "Historial vacío" ❌
│
T+30:40   PERO chargeHistory tiene fila #12345 ← Inconsistencia
└─ ❌ FALLO SILENCIOSO
```

---

## Puntos de Verificación en Supabase

```
PASO 1: ¿Hay vigilancias?
        SELECT COUNT(*) FROM active_watchers WHERE status='active'
        ├─ Si 0  → No hay vigilancias, usuario no activó
        └─ Si >0 → Hay vigilancias

PASO 2: ¿El cron ejecutó hoy?
        SELECT COUNT(*) FROM connector_state_changes 
        WHERE fecha = CAST(CURRENT_DATE AS TEXT) 
          AND estado_anterior = 'OCCUPIED'
        ├─ Si 0  → Cron no detectó liberaciones
        └─ Si >0 → Cron ejecutó exitosamente

PASO 3: ¿Hay consistencia?
        SELECT 
          (SELECT COUNT(*) FROM chargeHistory WHERE DATE(timestamp) = CURRENT_DATE) as cargas,
          (SELECT COUNT(*) FROM connector_state_changes WHERE fecha = CAST(CURRENT_DATE AS TEXT)) as cambios
        ├─ Si cargas = cambios     → ✓ Consistente
        ├─ Si cargas > cambios     → ❌ ERROR en line 137-151
        └─ Si cargas < cambios     → ⚠️ Raro, investigate

PASO 4: ¿Cuándo fue la última carga?
        SELECT * FROM connector_state_changes 
        WHERE estado_anterior = 'OCCUPIED'
        ORDER BY timestamp DESC LIMIT 1
        └─ Observar timestamp vs hora actual

PASO 5: ¿Hay alertas ringing bloqueando?
        SELECT COUNT(*) FROM watcher_call_events 
        WHERE status = 'ringing'
        ├─ Si 0  → No hay alertas activas
        └─ Si >0 → Ver si son recientes o antiguas
```
