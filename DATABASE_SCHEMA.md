# Esquema de Base de Datos - Guardian 24/7

## Tablas

### 1. `charger_state` - Estado Actual de Conectores

Esta tabla almacena el estado actual de cada estación. Se actualiza en cada ejecución del monitor.

**Estructura:**
```sql
CREATE TABLE charger_state (
  station_id TEXT PRIMARY KEY,
  station_name TEXT NOT NULL,
  state JSONB NOT NULL,
  last_check TIMESTAMPTZ DEFAULT NOW()
);
```

**Campos:**
- `station_id` (TEXT, PK): ID único de la estación (ej: "828537")
- `station_name` (TEXT): Nombre legible (ej: "Estacion Bus")
- `state` (JSONB): Array JSON con estado de conectores
- `last_check` (TIMESTAMPTZ): Última actualización

**Ejemplo de `state` JSONB:**
```json
[
  {
    "id": "001",
    "visualRef": "Conector 1",
    "status": "FREE"
  },
  {
    "id": "002",
    "visualRef": "Conector 2",
    "status": "OCCUPIED"
  },
  {
    "id": "003",
    "visualRef": "Conector 3",
    "status": "AVAILABLE"
  }
]
```

**Valores de `status`:**
- `FREE`: Libre y disponible
- `AVAILABLE`: Disponible
- `OCCUPIED`: Ocupado
- `BROKEN`: Averiado
- `UNKNOWN`: Desconocido

**Ejemplos de consultas:**
```sql
-- Ver todas las estaciones
SELECT station_name, last_check FROM charger_state ORDER BY station_name;

-- Ver estado de una estación específica
SELECT state FROM charger_state WHERE station_id = '828537';

-- Ver conectores libres
SELECT 
  station_name,
  jsonb_array_length(state) as total_conectores
FROM charger_state;

-- Buscar conectores ocupados
SELECT 
  station_name,
  state->0->>'visualRef' as conector,
  state->0->>'status' as status
FROM charger_state;
```

---

### 2. `logs` - Historial de Eventos

Esta tabla registra todos los eventos del sistema para auditoría y debugging.

**Estructura:**
```sql
CREATE TABLE logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  message TEXT,
  level TEXT DEFAULT 'INFO',
  station_id TEXT
);

CREATE INDEX idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX idx_logs_station ON logs(station_id);
```

**Campos:**
- `id` (BIGSERIAL, PK): ID único del log
- `timestamp` (TIMESTAMPTZ): Cuándo ocurrió el evento
- `message` (TEXT): Descripción del evento
- `level` (TEXT): Tipo de evento
- `station_id` (TEXT): Estación relacionada (opcional)

**Valores de `level`:**
- `INFO`: Información general
- `SUCCESS`: Operación exitosa
- `CAMBIO`: Cambio de estado detectado
- `ERROR`: Error en el sistema
- `WARNING`: Advertencia

**Ejemplos de logs:**
```
2024-01-15 14:30:00 | INFO | Sistema | Iniciando monitoreo...
2024-01-15 14:30:05 | SUCCESS | Estacion Bus | Consultada exitosamente. 3 conectores.
2024-01-15 14:30:06 | CAMBIO | Estacion Bus | Conector 1 cambió de OCCUPIED a FREE
2024-01-15 14:30:06 | INFO | Sistema | Monitoreo completado. 1 notificaciones enviadas.
2024-01-15 14:31:00 | ERROR | Avda. Roma | Error: Connection timeout
```

**Ejemplos de consultas:**
```sql
-- Ver todos los errores del último día
SELECT timestamp, station_id, message 
FROM logs 
WHERE level = 'ERROR' 
  AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- Ver cambios detectados
SELECT timestamp, station_id, message 
FROM logs 
WHERE level = 'CAMBIO'
ORDER BY timestamp DESC
LIMIT 20;

-- Ver eventos de una estación
SELECT timestamp, level, message 
FROM logs 
WHERE station_id = 'Estacion Bus'
ORDER BY timestamp DESC
LIMIT 50;

-- Contar eventos por tipo
SELECT level, COUNT(*) as count 
FROM logs 
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY level
ORDER BY count DESC;

-- Ver últimas 100 líneas de log
SELECT 
  timestamp,
  level,
  COALESCE(station_id, 'Sistema') as estacion,
  message
FROM logs
ORDER BY timestamp DESC
LIMIT 100;
```

---

## Mantenimiento

### Limpiar logs antiguos (> 30 días)
```sql
DELETE FROM logs WHERE timestamp < NOW() - INTERVAL '30 days';
```

### Ver tamaño de las tablas
```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename IN ('charger_state', 'logs')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Ver conteos
```sql
SELECT 
  'charger_state' as tabla,
  COUNT(*) as registros
FROM charger_state
UNION ALL
SELECT 
  'logs',
  COUNT(*)
FROM logs;
```

---

## Integración con el Código

### En `api/monitor.js`

**Lectura de estado anterior:**
```javascript
const getResponse = await fetch(
  `${SUPABASE_URL}/rest/v1/charger_state?station_id=eq.${est.id}`,
  { headers: { "Authorization": `Bearer ${SUPABASE_KEY}`, "apikey": SUPABASE_KEY } }
);
const estadoData = await getResponse.json();
```

**Guardado de estado:**
```javascript
await fetch(`${SUPABASE_URL}/rest/v1/charger_state`, {
  method: "POST",
  headers: { ..., "Prefer": "resolution=merge-duplicates" },
  body: JSON.stringify({
    station_id: String(est.id),
    station_name: est.nombre,
    state: actuales,
    last_check: new Date().toISOString()
  })
});
```

**Guardado de logs:**
```javascript
await fetch(`${SUPABASE_URL}/rest/v1/logs`, {
  method: "POST",
  headers: { ... },
  body: JSON.stringify({
    timestamp: new Date().toISOString(),
    message: `[${tipo}] ${estacion}: ${mensaje}`,
    level: tipo.toUpperCase(),
    station_id: estacion
  })
});
```

### En `app/api/logs/route.js`
```javascript
const response = await fetch(
  `${SUPABASE_URL}/rest/v1/logs?order=timestamp.desc&limit=${limit}`,
  { headers: { ... } }
);
```

---

## Límites y Performance

- **Retención de datos**: Mantén logs < 1 año (limpia regularmente)
- **Tamaño de `state` JSONB**: Máx. 1MB por estación (actualmente ~1KB)
- **Índices**: `idx_logs_timestamp` e `idx_logs_station` para queries rápidas
- **RLS**: Deshabilitada (acceso público via API key)

---

## Seguridad

- ⚠️ La `SUPABASE_ANON_KEY` permite escritura en `logs` y lectura en `charger_state`
- ⚠️ No incluyas datos sensibles en `message`
- ⚠️ Los logs son públicos si alguien obtiene la API key
- ✓ Considera agregar Row-Level Security (RLS) en producción
- ✓ Usa una service role key para operaciones administrativas

---

## Backups

Supabase hace backups automáticos. Para exportar manualmente:

1. Ve a Supabase > SQL Editor > New Query
2. Ejecuta:
```sql
-- Exportar charger_state
COPY (SELECT * FROM charger_state) TO STDOUT WITH CSV HEADER;

-- Exportar logs
COPY (SELECT * FROM logs) TO STDOUT WITH CSV HEADER;
```
