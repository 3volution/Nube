# Configuración del Cron Job para Guardian 24/7

## Paso 1: Obtén tu URL de Vercel

Tu función serverless estará disponible en:
```
https://your-vercel-app.vercel.app/api/monitor?token=YOUR_CRON_SECRET
```

Reemplaza:
- `your-vercel-app` con el nombre de tu proyecto en Vercel
- `YOUR_CRON_SECRET` con la variable `CRON_SECRET` que configuraste

Ejemplo:
```
https://guardian-24-7.vercel.app/api/monitor?token=abc123xyz789
```

## Paso 2: Configurar en cron-job.org

1. Ve a https://cron-job.org/en/
2. Crea una cuenta o inicia sesión
3. Haz click en "Create Cronjob"
4. Rellena los campos:
   - **Title**: Guardian Charger Monitor
   - **URL**: Tu URL de Vercel (del Paso 1)
   - **Execution time**: Elige "Every minute" (cada minuto)
   - **Timezone**: Europe/Madrid (o tu zona horaria)
   - **Notifications**: Marca si quieres alertas de cron-job.org

5. Haz click en "Create"

## Paso 3: Probar

Para verificar que funciona:

1. Abre el dashboard en: `https://your-vercel-app.vercel.app/monitor`
2. Espera 1-2 minutos
3. Deberías ver:
   - Estado actual de las estaciones
   - Logs con "SUCCESS" o "INFO"

## Endpoints Disponibles

### Monitor (función serverless)
```
GET /api/monitor?token=YOUR_CRON_SECRET
```
Respuesta:
```json
{
  "success": true,
  "notifications": 2,
  "cambios": [
    {
      "estacion": "Estacion Bus",
      "conector": "Conector 1",
      "estadoAnterior": "OCCUPIED",
      "estadoNuevo": "FREE",
      "timestamp": "2024-01-15T14:30:00Z"
    }
  ],
  "timestamp": "2024-01-15T14:30:00Z"
}
```

### Obtener Logs
```
GET /app/api/logs?limit=50&level=ERROR
```
Parámetros:
- `limit`: Número de logs (default: 50)
- `level`: Filtrar por tipo (INFO, ERROR, CAMBIO, SUCCESS)

### Obtener Estado de Estaciones
```
GET /app/api/stations
```

## Solucionar Problemas

### "Unauthorized" en logs
- Verifica que `CRON_SECRET` en la URL coincida con la variable de entorno
- Revisa las variables de entorno en Vercel → Settings → Environment Variables

### No hay conexión a Supabase
- Verifica `SUPABASE_URL` y `SUPABASE_ANON_KEY`
- Confirma que las tablas existen: `charger_state` y `logs`

### No se envían notificaciones por Telegram
- Verifica `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`
- Prueba manualmente: `https://api.telegram.org/botTU_TOKEN/sendMessage?chat_id=TU_CHAT_ID&text=Test`

### Error en Electromaps
- Verifica `ELECTROMAPS_USER` y `ELECTROMAPS_PASS`
- Confirma que la cuenta está activa
- Revisa que los IDs de estación son correctos

## Monitoreo en Tiempo Real

Accede al dashboard en cualquier momento:
```
https://your-vercel-app.vercel.app/monitor
```

El dashboard se actualiza automáticamente cada 30 segundos con:
- Estado actual de conectores
- Últimos logs del sistema
- Indicadores de salud

## Próximos Pasos

1. Agregar más estaciones editando `api/monitor.js` (array `ESTACIONES`)
2. Personalizar mensajes de Telegram en la función
3. Configurar alertas adicionales (email, Slack, etc.)
