# Nube v13.2: Access Logs Migration Summary

## Problema Resuelto

**Antes de V13.2:**
- Registros de acceso almacenados en `data/access-log.json` (filesystem)
- En producción (Vercel): EROFS (read-only file system) error
- Los registros se perdían en cada deployment
- Último registro congelado: 2026-07-02T11:06:30.750Z

**Causa Raíz:**
- Vercel filesystem es de solo lectura para archivos versionados
- `fs.writeFileSync()` fallaba con error: `EROFS: read-only file system, open '/var/task/data/access-log.json'`
- El archivo no podía persistir entre deployments

## Solución Implementada

### 1. Migración a Supabase

**Archivo modificado:** `app/api/access-log/route.js`

**Cambios:**
- Reemplazo de fs-based storage por Supabase `access_logs` table
- GET endpoint: Lee desde `access_logs` ordenado por timestamp DESC
- POST endpoint: Inserta registros en Supabase (persistente)
- Usa variables de entorno existentes: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`

**Antes (filesystem):**
```javascript
const LOG_FILE = path.join(process.cwd(), 'data', 'access-log.json');
fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2), 'utf8');
```

**Después (Supabase):**
```javascript
const { data, error } = await supabase
  .from('access_logs')
  .insert([{
    password: password || '',
    status: status || 'failed',
    date: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
    timestamp: new Date().toISOString()
  }])
  .select();
```

### 2. Actualización de .gitignore

**Archivo modificado:** `.gitignore`

**Cambios:**
- Agregado `/data/` para evitar versionado de archivos efímeros
- Impide que data/access-log.json sea tracked en git
- Permite que Vercel no intente servir archivos read-only

### 3. Versionado Actualizado

**Archivo modificado:** `app/config/version.ts`
- Actualizado: V13.1 → V13.2

### 4. Documentación

**Archivo creado:** `SUPABASE_SETUP.md`
- SQL script para crear tabla `access_logs`
- Índices para optimizar búsquedas
- Row Level Security (RLS) policies
- Instrucciones de deployment

**Archivo creado:** `MIGRATION_SUMMARY_v13.2.md` (este archivo)

## SQL Schema

```sql
CREATE TABLE access_logs (
  id BIGSERIAL PRIMARY KEY,
  password TEXT NOT NULL,
  status TEXT NOT NULL,
  date TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_access_logs_timestamp ON access_logs(timestamp DESC);
CREATE INDEX idx_access_logs_status ON access_logs(status);
```

## Cambios Esperados Después del Deploy

### En Producción:
- ✅ Endpoint POST `/api/access-log` escribirá en Supabase sin errores EROFS
- ✅ Registros de acceso persistirán entre deployments
- ✅ GET `/api/access-log` devolverá logs desde la BD
- ✅ Auditoría centralizada en Supabase

### En Git:
- ❌ `data/access-log.json` será removido (ingresará a .gitignore)
- ✅ Nuevos commits ya no incluirán archivos efímeros

## Flujo de Deployment

1. **Pre-requisito:** Ejecutar SQL script en Supabase SQL Editor
   ```
   Ir a Supabase Dashboard → SQL Editor → Pegar script de SUPABASE_SETUP.md
   ```

2. **Deploy automático:** PR #87 mergeado a main
   - Vercel inicia deployment automático
   - Descarga código con cambios
   - Endpoint ahora usa Supabase

3. **Validación:** Intentar login en producción
   - POST `/api/access-log` debería insertarse sin error
   - GET `/api/access-log` debería devolver registros

## Rollback (si es necesario)

```bash
# Revertir a V13.1
git revert 7f02891

# Restaurar filesystem storage
# - Reescribir route.js con fs-based code
# - Remover /data/ de .gitignore
# - Actualizar version.ts
```

## Archivos Afectados

| Archivo | Cambios | Impacto |
|---------|---------|--------|
| `app/api/access-log/route.js` | Supabase instead of fs | Breaking - requiere tabla en BD |
| `.gitignore` | Added `/data/` | Limpieza de repo |
| `app/config/version.ts` | V13.1 → V13.2 | Informativo |
| `SUPABASE_SETUP.md` | Nuevo | Documentación |

## Notas Técnicas

- **Persistencia:** Supabase garantiza persistencia entre deployments
- **Disponibilidad:** Requiere conectividad a Supabase (variable de entorno verificada)
- **RLS:** Policies configuradas para permitir INSERT/SELECT sin restricciones (endpoint autenticado)
- **Performance:** Índice en timestamp para queries rápidas

## Validación Post-Deploy

Ejecutar en producción:

```bash
# Test GET (debería devolver [] si es primer deploy)
curl https://merida.hackerdepueblo.es/api/access-log

# Test POST
curl -X POST https://merida.hackerdepueblo.es/api/access-log \
  -H "Content-Type: application/json" \
  -d '{"password":"TEST","status":"success"}'

# Verificar GET nuevamente (debería incluir el registro)
curl https://merida.hackerdepueblo.es/api/access-log
```

## Conclusión

V13.2 resuelve el problema de persistencia de registros de acceso en producción mediante la migración a Supabase. No hay migración de datos necesaria (inicio desde cero), y los registros ahora persistirán correctamente entre deployments.
