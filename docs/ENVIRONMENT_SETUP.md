# Variables de Entorno para Sistema de Monitoreo Inteligente

## Variables Requeridas

### Telegram Bot (Recomendado - GRATIS)
```
TELEGRAM_BOT_TOKEN=<tu_bot_token_aqui>
```
**Cómo obtener:**
1. Abre Telegram y busca @BotFather
2. Envía `/newbot`
3. Sigue las instrucciones
4. Copiar el token proporcionado

### Twilio (SMS + Voice Calls)
```
TWILIO_ACCOUNT_SID=<tu_account_sid>
TWILIO_AUTH_TOKEN=<tu_auth_token>
TWILIO_PHONE_NUMBER=<tu_numero_twilio>
```
**Cómo obtener:**
1. Ve a https://www.twilio.com
2. Crea una cuenta (prueba gratuita con $15)
3. Ve a Console → Account → API Keys
4. Copia Account SID y Auth Token
5. Compra o verifica un número en Twilio

### Seguridad - Token para Cron Job
```
CRON_SECRET=<genera_una_cadena_aleatoria_segura>
```
**Generar:**
```bash
openssl rand -base64 32
```

## Variables Opcionales

### URLs Base
```
NEXT_PUBLIC_SUPABASE_URL=<url_supabase>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
```

## Instalación en Vercel

1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega cada variable con su valor
4. Deploy

## Configuración de Cron Job

Para que el worker se ejecute cada minuto, agrega esto a `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/check-chargers",
      "schedule": "* * * * *"
    }
  ]
}
```

## Pruebas Locales

Para probar localmente, crea un archivo `.env.local`:

```
TELEGRAM_BOT_TOKEN=your_token_here
TWILIO_ACCOUNT_SID=your_sid_here
TWILIO_AUTH_TOKEN=your_token_here
TWILIO_PHONE_NUMBER=your_number_here
CRON_SECRET=your_secret_here
NEXT_PUBLIC_SUPABASE_URL=your_url_here
SUPABASE_SERVICE_ROLE_KEY=your_key_here
```

## Costos Estimados (Uso 3 días/semana)

- **Telegram:** $0/mes (GRATIS)
- **SMS Twilio:** ~$0.06-0.08 por mensaje = ~$0.50-1/mes (fallback ocasional)
- **Voice Twilio:** ~$0.15-0.30 por minuto = ~$1-2/mes (fallback ocasional)
- **COSTO TOTAL MENSUAL:** ~$2-3/mes

## Resolución de Problemas

### Telegram no envía mensajes
- Verificar que TELEGRAM_BOT_TOKEN es correcto
- Asegurar que el usuario ha iniciado chat con el bot
- Verificar que telegram_chat_id está guardado correctamente

### SMS/Voice no funciona
- Verificar credenciales de Twilio
- Asegurar que el número telefónico está en formato +34XXXXXXXXX
- Verificar que el número de origen (Twilio) está verificado

### Cron no se ejecuta
- Verifica que `vercel.json` está configurado correctamente
- Asegurar que CRON_SECRET es igual en la variable de entorno
- Revisar logs en Vercel → Deployments → Logs
