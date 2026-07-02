# DIAGNÓSTICO COMPLETO: HISTORIAL DE CARGAS - RESUMEN EJECUTIVO

## Problema Reportado

**"Las cargas realizadas hoy no aparecen en el Historial de Cargas"**

---

## Causa Raíz Identificada

### Punto Crítico: ERROR SILENCIOSO en `/api/watcher/check/route.js` línea 137-151

El INSERT en `connector_state_changes` **falla silenciosamente**:

```javascript
// Línea 120-135: Prepara insert
const { error: stateChangeError } = await supabase
  .from('connector_state_changes')
  .insert({
    connector_id: String(freedConnectorId),
    station_id: String(watcher.station_id),
    station_name: watcher.station_name,
    estado_anterior: freedPrevStatus,      // 'OCCUPIED'
    estado_nuevo: freedCurrStatus,         // 'FREE' o 'AVAILABLE'
    fecha: fecha,                          // YYYY-MM-DD
    dia: dia,                              // Nombre día
    hora: hora,                            // HH:MM:SS
    timestamp: chargeEndTime,              // ISO timestamp
    tiempo_en_estado_anterior_segundos: durationSeconds
  });

// Línea 150-151: MANEJO DEFICIENTE
if (stateChangeError) {
  console.error('watcher/check - error insertando state_change:', stateChangeError.message);
  // ↑ Se loguea el error pero NO retorna
  // ↓ La ejecución continúa normalmente
  // ↓ chargeHistory YA fue insertado en línea 106-118
}
```

### Resultado: Inconsistencia de Datos

```
chargeHistory:                  connector_state_changes:
┌─────────────────┐            ┌─────────────────┐
│ Fila 1 ✓        │            │ (vacío)         │
│ Fila 2 ✓        │            │ (vacío)         │
│ Fila 3 ✓        │            │ (vacío)         │
│ Fila 4 ✓        │            │ (vacío)         │
└─────────────────┘            └─────────────────┘

Monitor lee de: connector_state_changes
Resultado: Historial VACÍO (aunque chargeHistory tiene datos)
```

---

## Flujo Completo del Sistema

### 1. ACTIVACIÓN
```
Usuario activa vigilancia en Monitor
  ↓
POST /api/watcher
  ↓
INSERT active_watchers (status='active')
```

### 2. DETECCIÓN (cada 1 minuto, cron externo)
```
Cron externo
  ↓
GET /api/watcher/check?secret=<CRON_SECRET>
  ↓
Lee: active_watchers (status='active')
Consulta: Electromaps estado conectores
Compara: estado actual vs last_connector_states
  ↓
¿OCCUPIED → FREE/AVAILABLE?
  │
  YES →  INSERT chargeHistory ✓
         INSERT connector_state_changes ❌ (FALLA AQUÍ)
         Verifica alerta ringing
         Si no existe → Lanza Twilio
         INSERT watcher_call_events
  │
  NO  →  UPDATE active_watchers (last_connector_states)
```

### 3. VISUALIZACIÓN
```
Monitor /api/state-changes
  ↓
Lee: connector_state_changes (últimos 10,000)
  ↓
Procesa:
  - Empareja: OCCUPIED + FREE = 1 carga
  - Deduplica: connector + fecha + hora
  - Filtra: últimos 30 días
  - Ordena: más reciente primero
  ↓
Renderiza: Historial de Cargas
```

---

## Verificación Rápida (Ejecutar en Supabase)

### Test 1: ¿Hay vigilancias activas?
```sql
SELECT COUNT(*) as vigilancias_activas
FROM active_watchers 
WHERE status = 'active';
```

**Interpretación:**
- `0` → Usuario no activó vigilancia (sin datos esperado)
- `>0` → Hay vigilancia activa

### Test 2: ¿El cron ejecutó hoy?
```sql
SELECT COUNT(*) as cambios_detectados
FROM connector_state_changes 
WHERE fecha = CAST(CURRENT_DATE AS TEXT)
  AND estado_anterior = 'OCCUPIED'
  AND (estado_nuevo = 'FREE' OR estado_nuevo = 'AVAILABLE');
```

**Interpretación:**
- `0` → Cron no ejecutó o no detectó liberaciones
- `>0` → Cron ejecutó correctamente

### Test 3: ¿INCONSISTENCIA? (CRÍTICO)
```sql
SELECT 
  (SELECT COUNT(*) FROM chargeHistory 
   WHERE DATE(timestamp) = CURRENT_DATE) as cargas_registradas,
  (SELECT COUNT(*) FROM connector_state_changes 
   WHERE fecha = CAST(CURRENT_DATE AS TEXT)
     AND estado_anterior = 'OCCUPIED') as cambios_registrados;
```

**Interpretación:**
- `cargas = cambios` → ✓ Sistema consistente
- `cargas > cambios` → ❌ ERROR SILENCIOSO en línea 137-151
- `cargas < cambios` → ⚠️ Raro, investigar

### Test 4: ¿Última actividad?
```sql
SELECT 
  * 
FROM connector_state_changes 
WHERE estado_anterior = 'OCCUPIED'
ORDER BY timestamp DESC 
LIMIT 1;
```

**Interpretación:**
- Si timestamp es reciente → Cron ejecutó hace poco
- Si timestamp es antiguo → Cron no ejecutó recientemente

---

## Las 3 Causas Posibles

### Causa A: El cron no ejecuta
**Síntomas:** 
- `chargeHistory` completamente vacío
- `connector_state_changes` completamente vacío

**Soluciones:**
- Verificar que scheduler externo está activo
- Verificar que secret es correcto
- Verificar logs de Vercel

**Verificación:**
```sql
SELECT MAX(timestamp) FROM connector_state_changes;
-- Si resultado es NULL → Cron nunca ejecutó
-- Si es antiguo → Cron se detuvo
```

### Causa B: ERROR SILENCIOSO en connector_state_changes (MÁS PROBABLE)
**Síntomas:**
- `chargeHistory` tiene datos
- `connector_state_changes` vacío o tiene menos datos
- Monitor historial está vacío

**Causa Técnica:**
- Error RLS en Supabase
- Error de constraint violation
- Error de tipo de dato
- Error de permiso

**Soluciones:**
- Verificar RLS policies en tabla `connector_state_changes`
- Verificar que service_role_key tiene permisos
- Verificar tipos de dato en SQL vs valores en código

**Verificación:**
```sql
-- Comparar cantidades
SELECT 
  (SELECT COUNT(*) FROM chargeHistory WHERE DATE(timestamp) = CURRENT_DATE) as A,
  (SELECT COUNT(*) FROM connector_state_changes WHERE fecha = CAST(CURRENT_DATE AS TEXT)) as B;
-- Si A > B → Causa B
```

### Causa C: No hay vigilancias activas
**Síntomas:**
- Todo vacío (esperado)
- Sin errores

**Soluciones:**
- Usuario debe activar vigilancia desde Monitor
- Verificar que Electromaps devuelve conectores

**Verificación:**
```sql
SELECT * FROM active_watchers WHERE status = 'active';
-- Si vacío → Usuario no activó
```

---

## Tablas Involucradas

| Tabla | Rol | Escribe | Lee | Datos Hoy |
|-------|-----|---------|-----|-----------|
| `active_watchers` | Config vigilancia | /api/watcher POST/DELETE | /api/watcher/check, Monitor | Verificar con Q1 |
| `chargeHistory` | Audit de cargas | /api/watcher/check | Monitor | SELECT COUNT(*) WHERE DATE = TODAY |
| `connector_state_changes` | Cambios estado | /api/watcher/check ❌ | /api/state-changes, Monitor | SELECT COUNT(*) WHERE fecha = TODAY |
| `watcher_call_events` | Llamadas Twilio | /api/watcher/check | Monitor alertas | SELECT * ORDER BY DESC LIMIT 5 |

---

## Puntos Donde Sería Útil Añadir Logs

### A) Para verificar si el cron ejecuta (línea 55)
```javascript
console.log('[v0-DIAG] CRON START:', {
  timestamp: new Date().toISOString(),
  watchers_found: watchers.length,
  secret_valid: secret === process.env.CRON_SECRET
});
```

### B) Para detectar liberaciones (línea 88-103)
```javascript
for (const connectorId of Object.keys(currentStates)) {
  const prev = previousStates[connectorId];
  const curr = currentStates[connectorId];
  if (prev === 'OCCUPIED' && (curr === 'FREE' || curr === 'AVAILABLE')) {
    console.log('[v0-DIAG] LIBERACIÓN DETECTADA:', {
      connector: connectorId,
      from: prev,
      to: curr,
      station: watcher.station_name
    });
    freedConnectorId = connectorId;
    // ...
  }
}
```

### C) Para detectar error en connector_state_changes (línea 150-151) **CRÍTICO**
```javascript
if (stateChangeError) {
  console.error('[v0-DIAG] ERROR INSERTANDO connector_state_changes:', {
    error: stateChangeError.message,
    connector_id: freedConnectorId,
    station_id: watcher.station_id,
    timestamp: chargeEndTime
  });
}
```

### D) Para rastrear inserciones (línea 118)
```javascript
console.log('[v0-DIAG] INSERT chargeHistory OK:', {
  connector_id: freedConnectorId,
  durationMinutes: durationMinutes,
  isOverLimit: isOverLimit
});
```

---

## Consultas SQL para Supabase (Copiar/Pegar)

### Verificación rápida de consistencia
```sql
-- Test 1: Vigilancias activas
SELECT COUNT(*) as vigilancias FROM active_watchers WHERE status = 'active';

-- Test 2: Cambios OCCUPIED→FREE hoy
SELECT COUNT(*) as cambios FROM connector_state_changes 
WHERE fecha = CAST(CURRENT_DATE AS TEXT) 
  AND estado_anterior = 'OCCUPIED' 
  AND (estado_nuevo = 'FREE' OR estado_nuevo = 'AVAILABLE');

-- Test 3: Cargas registradas hoy
SELECT COUNT(*) as cargas FROM chargeHistory 
WHERE DATE(timestamp) = CURRENT_DATE;

-- Test 4: Comparar A vs B
SELECT 
  (SELECT COUNT(*) FROM chargeHistory WHERE DATE(timestamp) = CURRENT_DATE) as cargas,
  (SELECT COUNT(*) FROM connector_state_changes WHERE fecha = CAST(CURRENT_DATE AS TEXT) AND estado_anterior = 'OCCUPIED') as cambios;

-- Test 5: Última actividad
SELECT * FROM connector_state_changes 
WHERE estado_anterior = 'OCCUPIED' 
ORDER BY timestamp DESC LIMIT 1;

-- Test 6: Alertas ringing bloqueadas
SELECT COUNT(*) as alertas_ringing FROM watcher_call_events 
WHERE status = 'ringing';
```

---

## Próximos Pasos Recomendados

### AHORA (Verificación)
1. Ejecutar consultas SQL arriba (Tests 1-6)
2. Documentar resultados
3. Identificar en cuál test se rompe

### DESPUÉS (Diagnóstico)
1. Si Test 1 = 0 → Usuario debe activar vigilancia
2. Si Test 2 = 0 → Cron no ejecutó (revisar scheduler)
3. Si Test 4 (cargas > cambios) → ERROR CRÍTICO en línea 137-151

### DESPUÉS (Corrección)
1. Añadir logs en puntos A-D arriba
2. Ejecutar cron nuevamente
3. Revisar logs en Vercel dashboard
4. Identificar exactamente qué error ocurre
5. Corregir causa raíz

---

## Archivos de Referencia

- `DIAGNOSTIC_CHARGE_HISTORY.md` → Diagnóstico completo con todas las consultas
- `DEBUG_QUICK_START.md` → Quick reference para debugging
- `FLOW_DIAGRAM.md` → Diagramas visuales del flujo
- `/app/api/watcher/check/route.js` → Código del cron
- `/app/api/state-changes/route.js` → Endpoint que consume Monitor
- `/app/monitor/page.tsx` → Lógica de renderización

---

## Conclusión

**El problema PROBABLEMENTE es un ERROR SILENCIOSO en la línea 137-151 de `/api/watcher/check/route.js`**, donde el INSERT en `connector_state_changes` falla pero la ejecución continúa normalmente.

**Para confirmar:** Ejecutar Test 4 arriba. Si `cargas > cambios`, entonces esa es la causa.

**Para resolver:** 
1. Añadir log en línea 150-151 (punto C)
2. Ejecutar cron y revisar logs
3. Identificar qué error devuelve Supabase
4. Corregir la causa (RLS, constraint, tipo de dato, etc.)
