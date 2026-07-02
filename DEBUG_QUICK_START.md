# QUICK START: DEBUGGEAR HISTORIAL DE CARGAS

## Flujo completo

```
Cron externo
  ↓
GET /api/watcher/check?secret=<CRON_SECRET>
  ↓
  ├─ Lee tabla: active_watchers (status='active')
  ├─ Si vacío → Sin vigilancias, early exit
  │
  ├─ Para cada vigilancia:
  │   ├─ Consulta Electromaps estado actual conectores
  │   ├─ Compara con last_connector_states
  │   ├─ Si OCCUPIED → FREE/AVAILABLE:
  │   │   ├─ INSERT chargeHistory ✓
  │   │   ├─ INSERT connector_state_changes ❌ (ERROR SILENCIOSO AQUÍ)
  │   │   ├─ Verifica alerta ringing activa
  │   │   ├─ Si no existe → lanza Twilio call
  │   │   └─ INSERT watcher_call_events
  │   │
  │   └─ Si NO hay liberación:
  │       └─ UPDATE active_watchers (last_connector_states)
  │
Monitor/page.tsx
  ↓
GET /api/state-changes?limit=10000
  ↓
Lee tabla: connector_state_changes (últimos 10k)
  ↓
Procesa: empareja OCCUPIED→FREE, deduplica, filtra 30 días
  ↓
Renderiza: Historial de cargas completadas
```

---

## Los 3 puntos donde se puede romper

### Punto 1: El cron no ejecuta
**Síntoma:** `chargeHistory` y `connector_state_changes` completamente vacíos

**Causa:** 
- Scheduler externo caído/no configurado
- Secret incorrecto
- Electromaps API caída

**Verificar:**
```sql
SELECT COUNT(*) FROM connector_state_changes 
WHERE fecha = CAST(CURRENT_DATE AS TEXT);
-- Si es 0 → Cron no ejecutó hoy
```

### Punto 2: ERROR SILENCIOSO en connector_state_changes (CRÍTICO)
**Síntoma:** `chargeHistory` tiene registros, pero Monitor historial está vacío

**Causa:** Línea 137-151 en `/api/watcher/check/route.js`
```javascript
const { error: stateChangeError } = await supabase
  .from('connector_state_changes')
  .insert({...});

if (stateChangeError) {
  console.error('watcher/check - error insertando state_change:', stateChangeError.message);
  // ↑ Se loguea pero NO detiene ejecución
  // ↓ chargeHistory YA fue insertado arriba
}
```

**Verificar:**
```sql
SELECT COUNT(*) FROM chargeHistory 
WHERE DATE(timestamp) = CURRENT_DATE;

SELECT COUNT(*) FROM connector_state_changes 
WHERE fecha = CAST(CURRENT_DATE AS TEXT);

-- Si chargeHistory > 0 pero connector_state_changes = 0
-- → Falla en línea 137-151
```

### Punto 3: Filtro 30 días en Monitor (raro)
**Síntoma:** Cargas de hace >30 días filtradas

**Causa:** Línea 206-210 en `/app/monitor/page.tsx`
```javascript
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
.filter(c => new Date(c.startTimestamp || c.timestamp).getTime() >= thirtyDaysAgo.getTime());
```

**Verificar:**
```sql
SELECT COUNT(*) FROM connector_state_changes 
WHERE DATE(timestamp) >= DATE(CURRENT_DATE - INTERVAL '30 days');
```

---

## Verificación rápida (5 minutos)

### 1. ¿Hay vigilancias activas?
```sql
SELECT COUNT(*) FROM active_watchers WHERE status = 'active';
```
- Si 0 → Usuario debe activar vigilancia

### 2. ¿El cron ejecutó HOY?
```sql
SELECT COUNT(*) FROM connector_state_changes 
WHERE fecha = CAST(CURRENT_DATE AS TEXT)
  AND estado_anterior = 'OCCUPIED';
```
- Si 0 → Cron no detectó liberaciones

### 3. ¿chargeHistory vs connector_state_changes?
```sql
SELECT 
  (SELECT COUNT(*) FROM chargeHistory WHERE DATE(timestamp) = CURRENT_DATE) as cargas,
  (SELECT COUNT(*) FROM connector_state_changes WHERE fecha = CAST(CURRENT_DATE AS TEXT)) as cambios;
```
- Si cargas > cambios → ERROR SILENCIOSO en línea 137-151

### 4. ¿Última carga registrada?
```sql
SELECT * FROM connector_state_changes 
WHERE estado_anterior = 'OCCUPIED' 
  AND (estado_nuevo = 'FREE' OR estado_nuevo = 'AVAILABLE')
ORDER BY timestamp DESC LIMIT 1;
```
- Observar timestamp y comparar con hora actual

### 5. ¿Alertas ringing bloqueando?
```sql
SELECT COUNT(*) FROM watcher_call_events 
WHERE status = 'ringing' 
  AND (NOW() - last_attempt_at) > INTERVAL '30 minutes';
```
- Si > 0 → Hay alertas antiguas sin expiración

---

## Pasos para añadir logs (SIN hacer cambios todavía)

Para confirmar por dónde se rompe el flujo, sería útil agregar logs en:

1. **Línea 55 en `/api/watcher/check/route.js`**
   ```javascript
   console.log('[v0] CRON START - Vigilancias:', watchers.length);
   ```

2. **Línea 88-103 en `/api/watcher/check/route.js`**
   ```javascript
   if (freedConnectorId) {
     console.log('[v0] LIBERACIÓN DETECTADA:', freedConnectorId, 
                 'De:', freedPrevStatus, 'A:', freedCurrStatus);
   }
   ```

3. **Línea 150-151 en `/api/watcher/check/route.js`** (CRÍTICO)
   ```javascript
   if (stateChangeError) {
     console.log('[v0] ERROR INSERTANDO state_change:', stateChangeError.message);
   }
   ```

---

## SQL Completo para Supabase

Ver archivo: `DIAGNOSTIC_CHARGE_HISTORY.md` (sección 7)

---

## Resoluciones rápidas posibles

| Problema | Solución |
|----------|----------|
| Cron caído | Reintentar scheduler externo / verificar credenciales |
| Sin vigilancias | Activar vigilancia desde Monitor |
| Error Electromaps | Verificar credenciales `ELECTROMAPS_USER`/`ELECTROMAPS_PASS` |
| Error connector_state_changes | Verificar permisos RLS de Supabase en tabla |
| Alertas ringing antiguas | Ejecutar DELETE en watcher_call_events con filtro fecha |
| Filtro 30 días | Cambiar valor en Monitor línea 206 |
