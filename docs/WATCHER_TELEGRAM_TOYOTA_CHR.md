# HackerCharger — Vigilancia por Telegram Toyota CHR

## Comportamiento requerido (18-11-2026)

- Al detectar una transición `OCCUPIED -> FREE` o `OCCUPIED -> AVAILABLE` en una estación vigilada, enviar exactamente **5 mensajes** al bot **@RiderCHRbot**, con **1 segundo de espera entre envíos**.
- Tras registrar el quinto envío confirmado por Telegram, cambiar `active_watchers.status` a `completed`. No hay llamadas telefónicas, ni reintentos de Twilio.
- No repetir la serie si la misma comprobación se ejecuta dos veces. Una fila por `watcher_id` en `watcher_telegram_alerts` reserva la serie; `sent_count` registra progreso y permite reanudarla si falla una petición.
- El sistema envía los cinco mensajes dentro de una única ejecución de `/api/watcher/check`. El cron SOLO descubre la transición: no necesita ejecutar cada mensaje.
- La ventana /monitor informa de cinco avisos por Telegram y deja de ofrecer la prueba Twilio.

## Requisitos de despliegue

1. Comprobar backup y estado de Supabase antes de cambios.
2. Aplicar `scripts/create-watcher-telegram-alerts.sql` en el proyecto **BaseNubeHackerCharger**, ID `lckoxzvawaqcqqtrgvii`. La migración es aditiva; no cambia las filas antiguas y aplica RLS sin acceso anónimo.
3. En Vercel, para `v0-electric-charger-monitor`, asegurar que `TELEGRAM_BOT_TOKEN` corresponde realmente a `@RiderCHRbot` y `TELEGRAM_CHAT_ID` es el chat privado correcto. Si las variables existentes pertenecen a otro bot, configurar de manera segura las específicas `HACKERCHARGER_TELEGRAM_BOT_TOKEN` y `HACKERCHARGER_TELEGRAM_CHAT_ID`. El código valida `getMe.username` antes de enviar.
4. `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ELECTROMAPS_USER` y `ELECTROMAPS_PASS` deben existir en el entorno.
5. Configurar un scheduler autenticado para invocar `GET /api/watcher/check` cada minuto (ej. cron externo con `Authorization: Bearer <CRON_SECRET>`). **Importante:** el `vercel.json` actual solo programa otro endpoint diariamente a las 08:00 y NO activa este watcher.
6. Desplegar primero preview, validar, después promover a producción solo tras verificación.
7. Activar vigilancia desde /monitor cuando todos los conectores estén ocupados; en un cambio real o un ensayo controlado, verificar recepción de 5 mensajes, hora de cada envío, persistencia `sent_count=5` y estado `completed`; comprobar que no se recibe un sexto.

## Consideraciones

Los envíos se realizan en secuencia y esperan 1 segundo entre uno y el siguiente, por lo que la duración nominal de la serie es al menos 4 segundos más la latencia de Telegram y Supabase.

Telegram no ofrece confirmación de lectura: `sent_count` significa que la API `sendMessage` confirmó que aceptó el mensaje. En caso excepcional de fallo de red justo después de entregar el mensaje pero antes de confirmar, un reintento podría duplicarlo. No se promete exactamente una vez bajo pérdida de conectividad.

Las 3 vigilancias `charger_monitoring` heredadas del 1 de junio de 2026 son distintas de `active_watchers`; no se migran ni se borran en este cambio. Los scripts y endpoints heredados de Twilio permanecen para el historial pero no son utilizados por la nueva ruta.

## Reversión

No fusionar el PR o revertir el commit para volver al backend anterior. La tabla aditiva de Telegram puede permanecer sin afectar los registros antiguos. Si se necesita rollback de producción, seleccionar el despliegue anterior de Vercel; no borrar automáticamente la nueva tabla.
