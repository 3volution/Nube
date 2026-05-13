# Guía de Despliegue - Guardian 24/7

## Estado Actual

Tu sistema está completamente configurado y listo para desplegar. Aquí está lo que hemos implementado:

### Arquitectura
- **Backend**: Función serverless Node.js en Vercel (`api/monitor.js`)
- **Base de Datos**: Supabase PostgreSQL (con tablas `charger_state` y `logs`)
- **Notificaciones**: Telegram Bot con mensajes automáticos
- **Frontend**: Dashboard en Next.js 15 (`app/monitor/page.tsx`)
- **Scheduler**: cron-job.org (ejecuta cada minuto)

### Componentes Implementados

1. **API Serverless** (`api/monitor.js`)
   - Consulta 6 estaciones de carga cada ejecución
   - Compara estado anterior vs actual
   - Envía notificaciones Telegram si hay cambios (Ocupado → Libre)
   - Guarda logs detallados en Supabase
   - Duración máxima: 10 segundos

2. **Dashboard** (`app/monitor/page.tsx`)
   - Visualización en tiempo real del estado de conectores
   - Grid con color (verde = libre, rojo = ocupado)
   - Logs del sistema con filtros (ERROR, CAMBIO, SUCCESS, INFO)
   - Auto-actualización cada 30 segundos
   - Indicadores de salud

3. **APIs Web**
   - `GET /api/monitor?token=CRON_SECRET` - Función principal
   - `GET /app/api/stations` - Estado actual de todas las estaciones
   - `GET /app/api/logs?limit=50&level=ERROR` - Histórico de logs

4. **Base de Datos**
   - Tabla `charger_state`: Estado actual de conectores (ID estación → JSON)
   - Tabla `logs`: Historial de eventos del sistema

## Pasos de Despliegue

### 1. Desplegar a Vercel

```bash
# Opción A: Desde CLI (si tienes Vercel CLI instalado)
vercel deploy --prod

# Opción B: Desde GitHub
# Conecta tu repositorio en vercel.com/dashboard
```

### 2. Verificar Despliegue

Una vez desplegado, ve a tu proyecto en [vercel.com/dashboard](https://vercel.com/dashboard):

1. Copia el dominio (ej: `https://guardian-24-7.vercel.app`)
2. Verifica las variables de entorno en **Settings > Environment Variables**
3. Confirma que todas están configuradas:
   - ELECTROMAPS_USER ✓
   - ELECTROMAPS_PASS ✓
   - TELEGRAM_BOT_TOKEN ✓
   - TELEGRAM_CHAT_ID ✓
   - SUPABASE_URL ✓
   - SUPABASE_ANON_KEY ✓
   - CRON_SECRET ✓

### 3. Configurar Cron Job

Ve a [cron-job.org](https://cron-job.org/en/) y crea un cronjob con:

- **Título**: Guardian Charger Monitor
- **URL**: `https://tu-dominio.vercel.app/api/monitor?token=TU_CRON_SECRET`
- **Frecuencia**: Every minute
- **Haz click en Create**

### 4. Verificar Funcionamiento

1. Accede al dashboard: `https://tu-dominio.vercel.app/monitor`
2. Espera 1-2 minutos a que el cron se ejecute
3. Deberías ver:
   - Estado de las 6 estaciones
   - Logs con "SUCCESS" o "INFO"
   - Si hay cambios: notificación en Telegram

## Estructura de Archivos

```
/vercel/share/v0-project/
├── api/
│   └── monitor.js                 # Función serverless principal
├── app/
│   ├── api/
│   │   ├── logs/route.js           # API para obtener logs
│   │   └── stations/route.js       # API para obtener estado
│   ├── monitor/
│   │   └── page.tsx                # Dashboard web
│   ├── layout.tsx                  # Layout principal
│   └── page.tsx                    # Home (redirige a /monitor)
├── lib/
│   └── config.js                   # Configuración de estaciones
├── vercel.json                     # Configuración de funciones
├── package.json                    # Dependencias
├── CRON_SETUP.md                   # Guía detallada de cron
├── DEPLOYMENT.md                   # Este archivo
└── README.md                        # README general
```

## Monitoreo y Logs

### Acceder a Logs en Vercel

En [vercel.com/dashboard](https://vercel.com/dashboard):
1. Selecciona tu proyecto
2. Ve a **Deployments**
3. Haz click en el deploy
4. Ve a **Logs > Function Logs**
5. Verás los logs de cada ejecución

### Ver Logs en el Dashboard

Accede a `https://tu-dominio.vercel.app/monitor`:
- Los últimos 100 logs se muestran en tiempo real
- Filtra por tipo: INFO, ERROR, CAMBIO, SUCCESS
- Cada log muestra timestamp, nivel, estación y mensaje

### Logs en Supabase

Puedes consultar directamente en Supabase:
1. Ve a tu proyecto Supabase
2. **SQL Editor > New Query**
3. Ejecuta:
   ```sql
   SELECT * FROM logs ORDER BY timestamp DESC LIMIT 50;
   ```

## Agregar Más Estaciones

Para agregar las 4 estaciones restantes (tienes 6 de 10):

1. Abre `/api/monitor.js`
2. Edita el array `ESTACIONES`:
   ```javascript
   const ESTACIONES = [
     // ... estaciones actuales ...
     { nombre: "Nueva Estacion", id: 12345, direccion: "Dirección" },
   ];
   ```
3. Guarda y despliega: `vercel deploy --prod`

## Solucionar Problemas

### Error "Unauthorized"
- Verifica que `CRON_SECRET` en la URL sea igual a la variable de entorno
- Revisa en Vercel > Settings > Environment Variables

### Dashboard muestra "Sin datos"
- Espera 2-3 minutos a que el cron se ejecute
- Verifica logs en Vercel Deployments
- Comprueba que Supabase está accesible

### No se envían notificaciones Telegram
- Prueba manual: `https://api.telegram.org/botTOKEN/sendMessage?chat_id=CHAT_ID&text=Test`
- Verifica que el bot tiene permisos en el chat

### Errores en Electromaps
- Verifica credenciales (usuario/contraseña válidos)
- Comprueba que los IDs de estación son correctos
- Revisa logs en Vercel Deployments

## Próximos Pasos (Fase 2+)

- Agregar más estaciones (tienes 4 pendientes)
- Crear alertas personalizadas por estación
- Integrar con más servicios (Slack, Discord, Email)
- Historial avanzado y gráficas
- API pública para otros usuarios

## Contacto y Soporte

Si encuentras problemas:
1. Revisa los logs en Vercel Deployments
2. Comprueba variables de entorno en Vercel Settings
3. Verifica que Supabase y Telegram estén accesibles
4. Consulta CRON_SETUP.md para configuración específica del cron

¡Tu sistema Guardian 24/7 está listo para monitorear! 🚀
