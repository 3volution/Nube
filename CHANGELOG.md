# Changelog - Guardian

## v13.12 (Optimización de llamadas Twilio para prueba de facturación)

### Cambios
- Reducido el timeout de las llamadas Twilio de 14 s a 6 s.
- Reducido el número máximo de intentos de llamada de 2 a 1.
- Actualizado el mensaje de voz a "Intento 1 de 1".
- Sin cambios funcionales adicionales.

**Archivos modificados:**
- `app/services/notification-service.js`: timeout 14→6, mensaje actualizado
- `app/api/watcher/check/route.js`: max_attempts 2→1
- `app/config/version.ts`: V13.11→V13.12

---

## Versiones anteriores

Historial de cambios previos disponible en el repositorio.
