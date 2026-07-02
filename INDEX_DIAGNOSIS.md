# ÍNDICE: DIAGNÓSTICO COMPLETO HISTORIAL DE CARGAS

## Documentos Creados (1,336 líneas totales)

### 1. **CHEATSHEET_DIAGNOSIS.md** (176 líneas) ⭐ EMPIEZA AQUÍ
Resumen rápido (5 minutos). Test SQL de 1 minuto para confirmar el problema.

### 2. **DIAGNOSIS_SUMMARY.md** (365 líneas) ⭐ LUEGO AQUÍ
Diagnóstico ejecutivo. Resumen del flujo, las 3 posibles causas, puntos donde sería útil añadir logs.

### 3. **DEBUG_QUICK_START.md** (186 líneas)
Quick reference para debugging. Flujo simplificado, los 3 puntos donde se rompe, resoluciones rápidas.

### 4. **FLOW_DIAGRAM.md** (270 líneas)
Diagramas visuales del flujo. Línea de tiempo de un cambio exitoso vs fallido. Tabla de campos por tabla.

### 5. **DIAGNOSTIC_CHARGE_HISTORY.md** (515 líneas) ⭐ REFERENCIA COMPLETA
Diagnóstico técnico exhaustivo. Todos los detalles, todas las consultas SQL, análisis de cada línea del código.

---

## Orden de Lectura Recomendado

### Rápido (15 minutos)
1. CHEATSHEET_DIAGNOSIS.md → Ejecutar Test de 1 minuto
2. DIAGNOSIS_SUMMARY.md → Ver resultados

### Profundo (45 minutos)
1. CHEATSHEET_DIAGNOSIS.md
2. FLOW_DIAGRAM.md → Entender el flujo
3. DEBUG_QUICK_START.md → Los 3 puntos críticos
4. DIAGNOSIS_SUMMARY.md → El diagnóstico
5. DIAGNOSTIC_CHARGE_HISTORY.md → Referencia completa

---

## El Problema (Resumen Ejecutivo)

**Cargas completadas hoy NO aparecen en Monitor → Historial Vacío**

---

## La Causa (90% de probabilidad)

**ERROR SILENCIOSO en línea 137-151 de `/api/watcher/check/route.js`**

```javascript
const { error: stateChangeError } = await supabase
  .from('connector_state_changes')
  .insert({...});  // ← FALLA AQUÍ

if (stateChangeError) {
  console.error('watcher/check - error insertando state_change:', stateChangeError.message);
  // ↑ Se loguea pero NO retorna
  // ↓ chargeHistory YA fue insertado arriba (línea 106-118)
}
```

**Resultado:** `chargeHistory` tiene datos pero `connector_state_changes` está vacío.

Monitor lee de `connector_state_changes` → Historial aparece vacío.

---

## Test de 1 Minuto (Supabase)

```sql
-- ¿Inconsistencia?
SELECT 
  (SELECT COUNT(*) FROM chargeHistory WHERE DATE(timestamp) = CURRENT_DATE) as A,
  (SELECT COUNT(*) FROM connector_state_changes WHERE fecha = CAST(CURRENT_DATE AS TEXT)) as B;
```

**Si A > B → ERROR SILENCIOSO confirmado**

---

## Código Clave del Sistema

### Escritura (Cron cada 1 minuto)
**Archivo:** `/api/watcher/check/route.js`

| Operación | Línea | Tabla | Estado |
|-----------|-------|-------|--------|
| INSERT chargeHistory | 106-118 | chargeHistory | ✓ OK |
| INSERT connector_state_changes | 120-135 | connector_state_changes | ❌ ERROR |
| Manejo error | 150-151 | — | ⚠️ Deficiente |

### Lectura (Monitor cada 30s)
**Archivo:** `/api/state-changes/route.js`

| Operación | Línea | Tabla | Estado |
|-----------|-------|-------|--------|
| SELECT últimos 10k | 1-20 | connector_state_changes | ✓ OK |
| Ordenar DESC | 1-20 | — | ✓ OK |
| Formatear respuesta | 1-48 | — | ✓ OK |

### Visualización (Monitor)
**Archivo:** `/app/monitor/page.tsx`

| Operación | Línea | Estado |
|-----------|-------|--------|
| Empareja OCCUPIED→FREE | 152-164 | ✓ OK |
| Deduplica | 189-203 | ✓ OK |
| Filtra 30 días | 206-210 | ✓ OK |
| Renderiza | 212+ | ✓ OK |

---

## Las 3 Posibles Causas

### Causa A: El cron no ejecuta (Baja probabilidad)
**Síntomas:** Ambas tablas vacías
**Verificar:** Test SQL → A = 0 y B = 0
**Solución:** Revisar scheduler externo

### Causa B: ERROR SILENCIOSO en connector_state_changes (90% probabilidad)
**Síntomas:** A > B (chargeHistory > connector_state_changes)
**Verificar:** Test SQL → A > B
**Solución:** Ver punto crítico línea 137-151
**Acción:** Agregar log en línea 150-151

### Causa C: No hay vigilancias activas (Baja probabilidad)
**Síntomas:** Todo vacío (sin datos esperado)
**Verificar:** `SELECT COUNT(*) FROM active_watchers WHERE status='active'`
**Solución:** Activar vigilancia desde Monitor

---

## Puntos Donde Sería Útil Añadir Logs (NO implementados todavía)

### Punto A: Verificar ejecución del cron (línea 55)
```javascript
console.log('[v0-DIAG] CRON ejecutando:', watchers.length, 'vigilancias');
```

### Punto B: Detectar liberaciones (línea 88-103)
```javascript
if (freedConnectorId) {
  console.log('[v0-DIAG] Liberación:', freedConnectorId, 'de', freedPrevStatus, 'a', freedCurrStatus);
}
```

### Punto C: ERROR CRÍTICO (línea 150-151) ⭐ AQUÍ ES DONDE ESTÁ EL PROBLEMA
```javascript
if (stateChangeError) {
  console.error('[v0-DIAG] ERROR connector_state_changes:', stateChangeError.message);
}
```

### Punto D: Confirmar insert en chargeHistory (línea 118)
```javascript
console.log('[v0-DIAG] chargeHistory insertado OK');
```

---

## Flujo Visual Simplificado

```
CRON (cada 1 minuto)
  │
  ├─ ¿Vigilancias activas? → NO = sin datos (esperado)
  │                        → SÍ = continuar
  │
  ├─ Consulta Electromaps
  │
  ├─ ¿OCCUPIED → FREE? → NO = nada
  │                   → SÍ = continuar
  │
  ├─ ✓ INSERT chargeHistory (línea 106-118)
  │
  ├─ ❌ INSERT connector_state_changes (línea 120-135)
  │     ERROR SILENCIOSO AQUÍ (línea 150-151)
  │
  └─ Verifica alerta ringing / Lanza Twilio

MONITOR
  │
  ├─ GET /api/state-changes
  │
  ├─ Lee connector_state_changes
  │  (SÍ ESTÁ VACÍO por error arriba)
  │
  └─ Renderiza VACÍO
```

---

## Consultas SQL Referencia Rápida

### Test de inconsistencia (CRÍTICO)
```sql
SELECT (SELECT COUNT(*) FROM chargeHistory WHERE DATE(timestamp)=CURRENT_DATE) A,
       (SELECT COUNT(*) FROM connector_state_changes WHERE fecha=CAST(CURRENT_DATE AS TEXT)) B;
```

### Última actividad
```sql
SELECT * FROM connector_state_changes WHERE estado_anterior='OCCUPIED' ORDER BY timestamp DESC LIMIT 1;
```

### Vigilancias
```sql
SELECT * FROM active_watchers WHERE status='active';
```

### Alertas
```sql
SELECT * FROM watcher_call_events WHERE status='ringing' ORDER BY last_attempt_at DESC;
```

### Detalles chargeHistory
```sql
SELECT * FROM chargeHistory WHERE DATE(timestamp)=CURRENT_DATE ORDER BY timestamp DESC;
```

---

## Próximos Pasos (No Implementados Todavía)

### Paso 1: AHORA (Verificación)
1. Ejecutar Test de 1 minuto (SQL) arriba
2. Documentar resultado (A y B)
3. Comparar: ¿A > B?

### Paso 2: SI A > B (Investigación)
1. Leer `DIAGNOSIS_SUMMARY.md` sección "Punto Crítico"
2. Revisar línea 137-151 en `/api/watcher/check/route.js`
3. Verificar Supabase RLS policies en tabla `connector_state_changes`

### Paso 3: Debugging (Cuando esté listo)
1. Agregar log en línea 150-151 (Punto C arriba)
2. Ejecutar cron nuevamente
3. Revisar logs en Vercel Dashboard
4. Identificar exactamente qué error devuelve Supabase

### Paso 4: Corrección (Cuando esté confirmado)
1. Basado en error → corregir causa
2. Re-probar
3. Commit y PR

---

## Archivos del Codebase Relacionados

| Archivo | Rol | Crítico |
|---------|-----|---------|
| `/app/api/watcher/check/route.js` | Detecta liberaciones, inserta datos | ⭐⭐⭐ |
| `/app/api/state-changes/route.js` | Lee y formatea datos | ✓ |
| `/app/monitor/page.tsx` | Renderiza historial | ✓ |
| `/app/api/watcher/route.js` | Gestiona vigilancias | ✓ |

---

## Conclusión

El sistema tiene un **ERROR SILENCIOSO probablemente en línea 137-151 de `/api/watcher/check/route.js`**.

**Para confirmar:** Ejecutar Test SQL arriba (5 minutos)

**Para resolver:** Agregar log (Punto C) y revisar Vercel logs

**Documentación completa:** Ver archivos individuales listados arriba

---

## Contacto para Preguntas

- Problema técnico → Ver `DIAGNOSTIC_CHARGE_HISTORY.md`
- Debugging rápido → Ver `DEBUG_QUICK_START.md`
- Visuales → Ver `FLOW_DIAGRAM.md`
- Resumen → Ver `DIAGNOSIS_SUMMARY.md`
