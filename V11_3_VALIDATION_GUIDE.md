# V11.3 - HERRAMIENTA DE DIAGNÓSTICO Y VALIDACIÓN

## Objetivo

Antes de hacer commit/deploy, ejecuta esta herramienta para verificar que TODOS los componentes de V11.3 están configurados y funcionan correctamente.

---

## 1. DIAGNÓSTICO RÁPIDO (Sin deploy)

### 1.1 Verificar en desarrollo local

```bash
# En tu terminal local mientras dev server corre:
curl http://localhost:3000/api/watcher/diagnose

# O con pretty-print:
curl -s http://localhost:3000/api/watcher/diagnose | jq .
```

**Resultado esperado:**
```json
{
  "overall_status": "PASS - Ready for deployment",
  "checks": {
    "environment": {
      "status": "pass",
      "missingVars": []
    },
    "supabase": {
      "status": "pass",
      "table_exists": true,
      "active_watchers_count": 0
    },
    "twilio": {
      "status": "pass",
      "configured": {
        "TWILIO_ACCOUNT_SID": true,
        "TWILIO_AUTH_TOKEN": true,
        "TWILIO_PHONE_NUMBER": true,
        "TWILIO_CALL_RECIPIENT": true
      }
    },
    "watchers": {
      "status": "pass",
      "by_status": {
        "active": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0
      }
    },
    "state_changes": {
      "status": "pass",
      "duration_check": {
        "min_duration_seconds": 1200,
        "max_duration_seconds": 3600,
        "avg_duration_seconds": 2400,
        "warning": "No warnings"
      }
    }
  }
}
```

---

### 1.2 Chequeos específicos

```bash
# Solo variables de entorno
curl http://localhost:3000/api/watcher/diagnose?check=env

# Solo Supabase
curl http://localhost:3000/api/watcher/diagnose?check=supabase

# Solo Twilio
curl http://localhost:3000/api/watcher/diagnose?check=twilio

# Solo watchers activos
curl http://localhost:3000/api/watcher/diagnose?check=watchers

# Solo cambios de estado
curl http://localhost:3000/api/watcher/diagnose?check=state-changes
```

---

## 2. INTERPRETACIÓN DE ERRORES

### Error: "overall_status": "FAIL"

Significa que al menos un check falló. Busca en "checks" el que tiene `"status": "fail"`:

#### Caso: environment FAIL
```json
"environment": {
  "status": "fail",
  "missingVars": ["TWILIO_ACCOUNT_SID", "TWILIO_CALL_RECIPIENT"]
}
```
**Solución:** Añade las variables a `.env`:
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+34607373373
TWILIO_CALL_RECIPIENT=+34612345678
CRON_SECRET=your_cron_secret
```

#### Caso: supabase FAIL
```json
"supabase": {
  "status": "fail",
  "message": "relation \"active_watchers\" does not exist"
}
```
**Solución:** Ejecutar en Supabase SQL Editor:
```sql
-- Ver el script SQL en scripts/create-active-watchers-table.sql
-- Y ejecutarlo en el SQL Editor
```

#### Caso: twilio FAIL
```json
"twilio": {
  "status": "fail",
  "message": "Invalid credentials"
}
```
**Solución:** Verificar credenciales en Twilio Console:
1. Ir a https://console.twilio.com
2. Copiar Account SID y Auth Token correctos
3. Actualizar en .env

#### Caso: state_changes WARNING
```json
"state_changes": {
  "duration_check": {
    "warning": "Found durations ~60s - may indicate pre-V11.2 bug"
  }
}
```
**Significado:** Los datos históricos aún tienen el bug de V11.2. Los nuevos registros serán correctos. Esto es esperado después de actualizar.

---

## 3. CHECKLIST PRE-DEPLOY

Antes de hacer `git commit`, verifica que tu diagnóstico muestra:

- [ ] `overall_status`: "PASS - Ready for deployment"
- [ ] `environment.status`: "pass" con `missingVars: []`
- [ ] `supabase.status`: "pass" con `table_exists: true`
- [ ] `twilio.status`: "pass" con todos los `configured: true`
- [ ] `twilio.twilio_package`: "installed"
- [ ] `watchers.status`: "pass"
- [ ] `state_changes.status`: "pass"

---

## 4. PROCEDIMIENTO DE VALIDACIÓN POST-DEPLOY

Una vez deployed en producción:

### 4.1 Verificar diagnóstico en producción
```bash
curl https://tu-dominio.vercel.app/api/watcher/diagnose | jq .
```

### 4.2 Ejecutar los tests funcionales (ver V11_3_TEST_PLAN.md)

```bash
# Test 1.1: Credenciales configuradas
curl -X POST https://tu-dominio.vercel.app/api/twilio/test-call \
  -H "Content-Type: application/json" \
  -d '{"action":"check-credentials"}'

# Test 1.2: Validar número destino
curl -X POST https://tu-dominio.vercel.app/api/twilio/test-call \
  -H "Content-Type: application/json" \
  -d '{"action":"validate-recipient","phone":"+34612345678"}'

# Test 2.4: Simular cron
curl -X GET "https://tu-dominio.vercel.app/api/watcher/check?secret=TU_CRON_SECRET"
```

### 4.3 Verificar en Supabase que los datos se escriben
```sql
-- En Supabase SQL Editor:
SELECT * FROM active_watchers ORDER BY created_at DESC LIMIT 5;
SELECT * FROM connector_state_changes ORDER BY timestamp DESC LIMIT 10;
```

---

## 5. MÉTRICAS DE ÉXITO FINALES

| Métrica | Esperado | Verificación |
|---------|----------|--------------|
| Todas las env vars configuradas | 9/9 | `echo $TWILIO_ACCOUNT_SID` devuelve valor |
| Supabase conexión | OK | `curl .../diagnose?check=supabase` status=pass |
| Twilio funciona | OK | `/api/twilio/test-call` devuelve token válido |
| Watchers se crean | OK | `SELECT COUNT(*) FROM active_watchers` > 0 |
| Duraciones correctas | OK | `tiempo_en_estado_anterior_segundos` ≥ 300s |
| Retry logic funciona | OK | Vigilancia con retry_count=5 tiene status='failed' |

---

## 6. COMANDOS ÚTILES PARA DEBUGGING

```bash
# Ver todos los watchers
curl http://localhost:3000/api/watcher/diagnose?check=watchers | jq '.checks.watchers.recent_watchers'

# Ver cambios de estado recientes
curl http://localhost:3000/api/watcher/diagnose?check=state-changes | jq '.checks.state_changes.recent_changes'

# Ver solo variables de entorno
curl http://localhost:3000/api/watcher/diagnose?check=env | jq '.checks.environment'
```

---

## 7. TIMELINE PARA VALIDACIÓN COMPLETA

| Paso | Tiempo |
|------|--------|
| Diagnostico local | 2 min |
| Tests unitarios Twilio | 5 min |
| Tests E2E (UI → BD → Twilio) | 15 min |
| Tests de error (5 casos) | 10 min |
| Deploy y verificación producción | 10 min |
| **TOTAL** | **42 minutos** |

---

## 8. CRITERIOS PARA "LISTO PARA MERGE"

✅ TODOS estos deben cumplirse:
1. `curl .../diagnose` devuelve `overall_status: PASS`
2. Botón "Probar Llamada" inicia llamada Twilio real
3. Vigilancia se crea en BD con campos correctos
4. Cambios de estado detectados con duración real (no ~60s)
5. GET `/api/watcher/check?secret=X` devuelve JSON válido
6. Retry_count se incrementa y llega a 5
7. Status pasa de 'active' → 'completed' → 'failed' correctamente
8. Sin errores en console (remover todos `console.log`)

Si cualquiera de estos falla → **NO hacer commit hasta corregir**
