# CHEAT SHEET: DIAGNÓSTICO HISTORIAL DE CARGAS

## El Problema
Cargas completadas hoy NO aparecen en Monitor → Historial Vacío

## La Causa Probable (90% de probabilidad)
**ERROR SILENCIOSO en línea 137-151 de `/api/watcher/check/route.js`**

INSERT en `connector_state_changes` **falla pero la ejecución continúa**.

Resultado: `chargeHistory` tiene datos pero `connector_state_changes` está vacío.

## Test de 1 Minuto (Supabase SQL Editor)

```sql
-- Test 1: ¿Tiene datos chargeHistory hoy?
SELECT COUNT(*) FROM chargeHistory WHERE DATE(timestamp) = CURRENT_DATE;

-- Test 2: ¿Tiene datos connector_state_changes hoy?
SELECT COUNT(*) FROM connector_state_changes WHERE fecha = CAST(CURRENT_DATE AS TEXT);

-- Test 3: Comparar
SELECT 
  (SELECT COUNT(*) FROM chargeHistory WHERE DATE(timestamp) = CURRENT_DATE) as A,
  (SELECT COUNT(*) FROM connector_state_changes WHERE fecha = CAST(CURRENT_DATE AS TEXT)) as B;
```

## Interpretación de Resultados

| Test 1 | Test 2 | Causa | Acción |
|--------|--------|-------|--------|
| 0 | 0 | Cron no ejecutó | Revisar scheduler externo |
| >0 | 0 | **ERROR SILENCIOSO** (90%) | Ver Punto A más abajo |
| >0 | >0 | ✓ Funcionando | Revisar filtros Monitor (30 días) |
| - | - | Sin vigilancias | Activar desde Monitor |

## Punto A: Confirmar Error Silencioso

**Archivo:** `/api/watcher/check/route.js`

**Línea 137-151:** Buscar este código
```javascript
const { error: stateChangeError } = await supabase
  .from('connector_state_changes')
  .insert({...});

if (stateChangeError) {
  console.error('watcher/check - error insertando state_change:', stateChangeError.message);
  // ↑ Se loguea pero NO retorna
}
```

**Problema:** El error se loguea pero la ejecución continúa.

**Solución temporal:** Agregar un log más detallado:
```javascript
if (stateChangeError) {
  console.error('[v0-DIAG] ERROR connector_state_changes:', {
    error: stateChangeError.message,
    connector: freedConnectorId,
    station: watcher.station_name
  });
  // Cuando se vea este log en Vercel dashboard, sabremos qué error ocurre
}
```

## Punto B: Ver Última Actividad

```sql
-- ¿Cuándo fue la última carga registrada?
SELECT * FROM connector_state_changes 
WHERE estado_anterior = 'OCCUPIED' 
ORDER BY timestamp DESC LIMIT 1;

-- Observar la columna "timestamp" y comparar con hora actual
```

## Punto C: ¿Hay Vigilancias?

```sql
SELECT * FROM active_watchers WHERE status = 'active';
```
- Si vacío → Usuario no activó vigilancia (sin datos esperado)
- Si >0 → Hay vigilancia

## Punto D: Alertas Ringing Bloqueadas

```sql
SELECT * FROM watcher_call_events WHERE status = 'ringing' ORDER BY last_attempt_at DESC;
```
- Si hay alertas >30 min sin actualizar → Pueden estar bloqueando nuevas detecciones

## Flujo Simplificado

```
Cron (cada 1 min)
  ↓
¿Vigilancias activas?
  ├─ NO  → Sin datos (esperado)
  └─ YES → Consulta Electromaps
          ↓
          ¿OCCUPIED → FREE?
            ├─ NO  → Nada
            └─ YES → INSERT chargeHistory ✓
                     INSERT connector_state_changes ❌ FALLA AQUÍ
                     Monitor no ve datos
```

## Archivos Clave

| Archivo | Responsable | Línea Crítica |
|---------|-------------|---------------|
| `/api/watcher/check/route.js` | Detecta liberaciones | **137-151** (ERROR) |
| `/api/state-changes/route.js` | Lee historial | 1-48 (OK) |
| `/monitor/page.tsx` | Renderiza datos | 150-212 (OK) |

## Consultas SQL Útiles

### Verificación rápida
```sql
SELECT COUNT(*) as A FROM chargeHistory WHERE DATE(timestamp)=CURRENT_DATE;
SELECT COUNT(*) as B FROM connector_state_changes WHERE fecha=CAST(CURRENT_DATE AS TEXT);
-- Si A > B → ERROR SILENCIOSO confirmado
```

### Última carga
```sql
SELECT * FROM connector_state_changes WHERE estado_anterior='OCCUPIED' ORDER BY timestamp DESC LIMIT 1;
```

### Vigilancias
```sql
SELECT * FROM active_watchers WHERE status='active';
```

### Alertas
```sql
SELECT * FROM watcher_call_events WHERE status='ringing';
```

## Paso a Paso para Resolver

### 1. Confirmar el problema (5 min)
```sql
SELECT COUNT(*) as chargeHistory, 
       (SELECT COUNT(*) FROM connector_state_changes WHERE fecha=CAST(CURRENT_DATE AS TEXT)) as state_changes
FROM chargeHistory WHERE DATE(timestamp)=CURRENT_DATE;
```
Si `chargeHistory > state_changes` → Problema confirmado

### 2. Investigar el error (10 min)
- Abrir Vercel Dashboard → Logs
- Buscar: `watcher/check - error insertando state_change`
- Copiar el mensaje exacto del error

### 3. Identificar la causa
| Error | Causa | Solución |
|-------|-------|----------|
| `permission denied` | RLS bloqueando | Revisar RLS policies |
| `constraint violation` | Campo no válido | Revisar tipos de dato |
| `invalid JSON` | Campo mal formateado | Revisar formato campos |
| Otros | Desconocida | Revisar Supabase logs |

### 4. Añadir log y reejecutar
Agregar log en línea 150-151 (Punto A más arriba), ejecutar cron, revisar Vercel logs.

## No Modifiques Todavía

Este es SOLO un diagnóstico. No se ha hecho ningún cambio al código.

Una vez confirmado dónde está el error, se pueden hacer correcciones.

---

**Resumen:** Probablemente hay un error silencioso cuando intenta insertar en `connector_state_changes`. Ejecuta el Test de 1 Minuto arriba y comparte los resultados.
