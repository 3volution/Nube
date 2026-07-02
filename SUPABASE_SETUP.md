# Supabase Setup for Nube v13.2

## Access Logs Table Migration

La versión V13.2 migra el registro de accesos desde el filesystem (`data/access-log.json`) a una tabla de Supabase para garantizar persistencia en producción.

### SQL Script para crear la tabla

Ejecuta este script SQL en el Supabase SQL Editor:

```sql
-- Crear tabla access_logs para registro de intentos de login
CREATE TABLE access_logs (
  id BIGSERIAL PRIMARY KEY,
  password TEXT NOT NULL,
  status TEXT NOT NULL,
  date TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Crear índice en timestamp para búsquedas rápidas
CREATE INDEX idx_access_logs_timestamp ON access_logs(timestamp DESC);

-- Crear índice en status para filtros
CREATE INDEX idx_access_logs_status ON access_logs(status);

-- Permitir lectura desde anónimo (RLS deshabilitado para este endpoint)
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- Policy: permitir INSERT
CREATE POLICY "Allow insert to access_logs"
  ON access_logs
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- Policy: permitir SELECT
CREATE POLICY "Allow select from access_logs"
  ON access_logs
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Comentario de tabla
COMMENT ON TABLE access_logs IS 'Registro de intentos de login. Migrado de filesystem a BD en v13.2.';
```

### Cambios en el código

1. **`/app/api/access-log/route.js`**: Migrado a Supabase
   - GET: Obtiene logs desde `access_logs` table
   - POST: Inserta registro en `access_logs` table
   - Usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (ya configuradas)

2. **`.gitignore`**: Actualizado
   - `/data/` agregado para evitar versionado de archivos efímeros
   - El archivo `data/access-log.json` será removido del repo

3. **`version.ts`**: Actualizado a V13.2

### Procedimiento de deploy

1. Ejecutar script SQL en Supabase
2. Push cambios a GitHub
3. Vercel autodeploy actualizará la aplicación
4. El endpoint `/api/access-log` funcionará con Supabase

### Rollback

Si necesitas volver a filesystem:
- Revertir cambios en `/app/api/access-log/route.js`
- Remover líneas de `/data/` de `.gitignore`
- Restaurar `version.ts` a V13.1
