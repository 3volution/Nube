# Guía de Configuración - Sistema de Monitoreo Inteligente de Cargadores

## Descripción General
El sistema de monitoreo inteligente te permite vigilar ubicaciones específicas de cargadores. Cuando detecta que un cargador pasa de OCUPADO a LIBRE, te envía una alerta en cascada: primero intenta Telegram (gratis), luego SMS (barato), y finalmente una llamada Twilio (como último recurso).

## Pasos de Instalación

### 1. Crear Tabla en Base de Datos
Ejecuta el script SQL en Supabase:
```bash
# Copia y pega el contenido de scripts/create_charger_monitoring_table.sql
# en el SQL Editor de Supabase para crear las tablas
```

### 2. Configurar Telegram Bot (Nivel 1 - GRATIS)
1. Abre Telegram y busca a **@BotFather**
2. Envía `/newbot`
3. Sigue las instrucciones para crear tu bot
4. Copia el token que te proporciona (ej: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
5. Guarda este token como `TELEGRAM_BOT_TOKEN`

Para obtener tu `telegram_chat_id`:
1. En Telegram, agrégale el bot a tu chat privado
2. Envía `/start` o cualquier mensaje
3. Abre en el navegador: `https://api.telegram.org/bot<TU_TOKEN>/getUpdates`
4. Busca `"chat":{"id":123456789}` - ese número es tu `telegram_chat_id`

### 3. Configurar Twilio (Nivel 2-3 - SMS + Llamadas)
1. Ve a https://www.twilio.com
2. Crea una cuenta gratis (te dan $10 de crédito)
3. En la consola, ve a **Account > API Keys & tokens**
4. Copia `Account SID` y `Auth Token`
5. Ve a **Phone Numbers > Manage Numbers**
6. Compra un número telefónico de Twilio (o usa el número de prueba)
7. Guarda estos valores:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER` (el número de Twilio)

### 4. Generar CRON_SECRET
Genera una cadena aleatoria segura para proteger el endpoint del worker:
```bash
openssl rand -base64 32
```
Guarda el resultado como `CRON_SECRET`

### 5. Agregar Variables de Entorno en Vercel
En tu proyecto Vercel, ve a **Settings > Environment Variables** y agrega:
```
TELEGRAM_BOT_TOKEN=<tu_token_de_telegram>
TWILIO_ACCOUNT_SID=<tu_account_sid>
TWILIO_AUTH_TOKEN=<tu_auth_token>
TWILIO_PHONE_NUMBER=<tu_numero_twilio>
CRON_SECRET=<tu_secret_generado>
NEXT_PUBLIC_SUPABASE_URL=<ya_deberías_tener_esto>
SUPABASE_SERVICE_KEY=<ya_deberías_tener_esto>
```

### 6. Configurar Cron Job en Vercel
En tu `vercel.json`, agrega (o verifica que exista):
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

### 7. Deploy
```bash
git add .
git commit -m "feat: Add intelligent charger monitoring system V9.2"
git push
```

## Cómo Usar

### Iniciar Monitoreo
1. En la página Monitor, encuentra la estación que quieres vigilar
2. Haz clic en el botón **"Monitorear"** (azul)
3. Se abre un modal con opciones:
   - **Métodos de notificación**: Selecciona cuáles habilitar (recomendado todos para cascada)
   - **Teléfono**: Ingresa tu número con código de país (ej: +34612345678)
   - **Duración**: Elige cuántos minutos vigilar (máx 120)
4. Haz clic en **"Iniciar Monitoreo"**
5. El botón cambia a **"Monitoreando..."** mientras está activo

### Recibir Alertas
Cuando se detecte disponibilidad:
1. **Primero**: Recibirás 10 mensajes rápidos en Telegram (gratis)
2. **Si Telegram falla**: Se envía SMS a tu teléfono (~$0.06 por msg)
3. **Si SMS falla**: Se hace una llamada Twilio con mensaje de voz (~$0.15 por minuto)
4. El monitoreo se detiene automáticamente

### Detener Monitoreo Manual
- Haz clic en el badge rojo "X" en la estación siendo monitoreada
- O simplemente espera a que se cumpla la duración (ej: 120 minutos)

## Costos Estimados

### Uso Típico (3 días/semana)
- **Telegram**: $0 (gratis)
- **SMS fallback**: ~$0.50-1/mes (ocasional)
- **Twilio fallback**: ~$1-2/mes (raro)
- **COSTO TOTAL: ~$2-3/mes**

### Comparación
- Solo Telegram (sin garantía): $0
- Solo Twilio (sin ahorro): $8-16/mes
- Con cascada (RECOMENDADO): $2-3/mes

## Troubleshooting

**P: No recibo alertas de Telegram**
R: Verifica que:
- TELEGRAM_BOT_TOKEN es correcto
- Agregaste el bot a tu chat de Telegram
- El telegram_chat_id en la BD es correcto

**P: SMS no llegan**
R: Verifica que:
- TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN son correctos
- El teléfono incluye código de país (+34...)
- Tu cuenta Twilio tiene crédito

**P: El worker no corre cada minuto**
R: Verifica que:
- `vercel.json` tiene la configuración correcta
- El endpoint `/api/cron/check-chargers` existe
- CRON_SECRET es correcto

## Próximas Mejoras
- [ ] Historial de alertas en dashboard
- [ ] Configuración persistente por estación
- [ ] WhatsApp como opción adicional
- [ ] Integración con calendario para alertas automáticas en horarios específicos

## Soporte
Para reportar bugs o sugerencias, abre un issue en el repositorio.
