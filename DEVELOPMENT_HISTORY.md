# DEVELOPMENT HISTORY - Historial Completo del Proyecto

## Resumen Ejecutivo

Este documento es una **retrospectiva cronológica completa** de todo lo desarrollado desde el inicio del proyecto hasta hoy (6 de junio de 2026). Incluye decisiones, problemas, soluciones, y estado actual real del código.

---

## FASE 0: Idea Inicial (Pre-V1)

### Objetivo Original
Sistema de notificaciones automático para detectar disponibilidad de cargadores eléctricos en Mérida usando API Electromaps.

### Tecnología Base
- Next.js 16 (App Router)
- Supabase (PostgreSQL)
- Twilio (llamadas telefónicas)
- Telegram (notificaciones)
- Cron jobs (ejecución periódica)

---

## FASE 1: V1.0 - MVP Inicial

### Decisiones Arquitectónicas
1. **Monitor principal:** Endpoint que se ejecuta cada minuto vía cron-job.org
2. **Fuente de datos:** Electromaps API (consultas directas con token AWS Cognito)
3. **Notificaciones duales:** Telegram + Twilio
4. **Persistencia:** Supabase para historial de cambios

### Lo Que Funcionó
- ✅ Integración Electromaps exitosa
- ✅ Detección de cambios OCCUPIED→AVAILABLE
- ✅ Notificaciones Telegram automáticas
- ✅ Almacenamiento de historial en `connector_state_changes`

### Lo Que No Funcionó
- ❌ Twilio: Implementación incompleta (problema: número hardcodeado en env var)
- ❌ Watcher: Sistema de vigilancia nunca completamente funcional
- ❌ Logging: Excesivamente verbose desde el inicio
- ❌ Docs: Falta de documentación clara

### Versiones Intermedias (V1.1 - V1.5)
- Múltiples intentos de arreglar Twilio
- Refinamientos en detección de cambios
- Correcciones de logs excesivos
- Intentos fallidos de "mejorar" watcher sin claridad de requisitos

---

## FASE 2: V2.0 - V11.3 (Iteraciones Caóticas)

### El Problema
Existían DOS motores paralelos sin claridad:
1. `api/monitor.js` - Motor Telegram automático ✅ (FUNCIONABA)
2. `/api/watcher/check` - Motor Twilio (APARENTEMENTE NO)
3. `/api/telegram-webhook` - Control manual (CONFUSIÓN)

### Síntomas
- Documentación contradictoria
- Código de debug abandonado
- Endpoints temporales sin propósito claro
- Logging [v0] granular innecesario
- Múltiples "versiones" de diseño sin coherencia

### Lo Que Pasó
Entre V2.0 y V11.3 hubo:
- 15+ documentos de diseño/propuesta
- 8+ cambios de arquitectura "finales"
- Diagnósticos sin soluciones
- Análisis sin consenso
- Commits sin dirección clara

---

## FASE 3: V11.3 Auditoría (Hace 2 Días)

### La Crisis
Production mostraba "V11.3" pero nadie sabía:
- Qué motor estaba ejecutándose realmente
- Por qué Twilio no funcionaba
- Si el sistema era caótico o estaba todo bien

### Lo Que Descubrimos
Mediante análisis exhaustivo de logs, código y Supabase:

**Motor Real: `api/monitor.js`**
```
Cron cada minuto
  → Consulta Electromaps
  → Detecta OCCUPIED→AVAILABLE
  → Envía a Telegram
  → Registra en Supabase
  → 1000 registros en 19 días (datos válidos)
```

**Motor Secundario: `/api/watcher/check`**
- ✅ Código correcto
- ❌ Aparentemente nunca se ejecutaba
- ❌ Twilio nunca enviaba llamadas

**Motor Manual: `/api/telegram-webhook`**
- ✅ Solo para control manual
- ✅ Documentado como "manual" al final

---

## FASE 4: V12.0 Consolidación (Ayer)

### Decisión: Congelar Arquitectura
"Monitor es el motor oficial. Twilio pasa a ser un canal de salida. Eliminar duplicidades."

### Lo Que Se Hizo
1. **Limpieza extrema:**
   - Eliminados 2 endpoints temporales
   - 15 documentos de diagnóstico eliminados
   - 2 scripts de análisis borrados
   - Logging [v0] granular removido

2. **Documentación oficial:**
   - ARCHITECTURE.md actualizado
   - V12_0_RELEASE_NOTES.md creado
   - Marca congelada con tag v12.0.0

3. **Consolidación Git:**
   - Rama v0/3evolution-1984-bc05568e contiene V12.0
   - Merge a main ejecutado
   - Production actualizado (commit 5a96d7a)

### Estado Final
- ✅ Arquitectura clara
- ✅ Código limpio
- ✅ Production en V12.0
- ✅ Telegram funcionando perfectamente
- ❌ Twilio sigue sin número personalizado del usuario

---

## FASE 5: Descubrimiento Crítico (Hoy)

### Auditoría Twilio Reveló
El problema de Twilio NO es que no funciona. Es que:

```
Usuario ingresa +34XXXXXX en formulario
  ↓
WatcherModal captura en state
  ↓
handleStartWatcher() POST /api/watcher
  ↓
❌ NO SE ENVÍA el número
  ↓
Backend INSERT active_watchers sin campo phone
  ↓
Cron ejecuta /api/watcher/check
  ↓
sendNotification(process.env.TWILIO_CALL_RECIPIENT, ...)
  ↓
Llama SIEMPRE al número de env var (global, nunca personalizado)
```

**Resumen:** Twilio funciona, pero ignora completamente lo que el usuario ingresa.

---

## ESTADO ACTUAL - 6 DE JUNIO DE 2026

### Tablas Supabase
```
connector_state_changes: 1000 registros (19 días)
active_watchers: Tabla creada pero sin usar realmente
charger_state: Almacena último estado de cada conector
```

### Endpoints Activos (17 total)
| Endpoint | Función | Estado |
|----------|---------|--------|
| api/monitor.js | Motor principal Telegram | ✅ Funcionando |
| /api/watcher/check | Motor Twilio | ✅ Código correcto, ❌ No personaliza números |
| /api/watcher | Crear vigilancias | ✅ Crear, ❌ No guardar teléfono |
| /api/telegram-webhook | Control manual | ✅ Funcionando |
| /api/twilio/test-call | Test Twilio | ✅ Funcionando (env var) |
| (+ 12 más) | Monitoreo, logs, etc | ✅ Operacionales |

### Estadísticas de Uso Real
- Conectores monitoreados: 5 principales
- Sesiones de carga analizadas: 225 completas
- Duración media: 142 minutos (2.4 horas)
- Conectores problemáticos: 003652 (187 eventos OUT_OF_SERVICE)

### Production (merida.hackerdepueblo.es)
- ✅ Operativa
- ✅ Sirviendo V12.0
- ✅ Supabase registrando cambios
- ✅ Telegram notificando
- ⚠️ Twilio: Solo con número global

---

## LECCIONES APRENDIDAS

### Lo Que Funcionó Bien
1. **API Electromaps:** Integración sólida, datos confiables
2. **Telegram:** Canal automático robusto, 0 problemas operacionales
3. **Supabase:** Almacenamiento confiable, queries eficientes
4. **Cron externo:** Ejecución periódica predecible
5. **Monitor.js:** Código simple y efectivo

### Lo Que Fué Problemático
1. **Documentación caótica:** 15+ versiones sin consenso
2. **Arquitectura emergente:** Se descubrió, no se planificó
3. **Twilio incompleto:** Desde V1 sin resolver
4. **Debugging sin fin:** Análisis sin implementación
5. **Ramas duplicadas:** feature branch con V12.0 pero Production atrasada

### Lo Que Debe Cambiar
1. **Especificar primero:** Claridad en requisitos antes de código
2. **Documentación única:** Un documento = fuente de verdad
3. **Testing real:** Verificar en production, no solo en código
4. **Iteraciones cortas:** Cambiar-Verif-Documentar, no análisis infinito
5. **Decisiones binarias:** SÍ/NO, no "vamos a ver"

---

## PROXIMOS PASOS (TÚ DECIDES)

### Opción 1: Arreglar Twilio (Recomendado)
- Guardar número de usuario en active_watchers
- Pasar número a sendNotification()
- Validar teléfono en formulario
- Tiempo: ~2 horas

### Opción 2: Robustecer Todo
- Validación completa de entrada
- Manejo de errores Twilio
- Retry logic para llamadas fallidas
- Testing end-to-end
- Tiempo: ~8 horas

### Opción 3: Simplificar
- Mantener solo un número global
- Eliminar UI de "ingresar teléfono"
- Documentar como limitación conocida
- Tiempo: ~30 minutos

---

## Archivos Clave Para Entender El Código

### Motor Principal
- `api/monitor.js` - El corazón del sistema (Monitor)

### Fachada de Acceso
- `app/api/watcher/route.js` - POST para crear vigilancias
- `app/api/watcher/check/route.js` - Motor de detección (Watcher)

### Notificaciones
- `app/services/notification-service.js` - Twilio + Telegram
- `app/api/telegram-webhook/route.js` - Control manual Telegram

### Frontend (Donde ingresas el número)
- `app/components/WatcherModal.tsx` - Formulario de vigilancia
- `app/components/MonitoringDashboard.tsx` - Dashboard principal

### Modelos/Schemas
- `app/lib/types.ts` - Interfaces TypeScript
- Base de datos: Ver ARCHITECTURE.md

---

## Conclusión

El proyecto está **operacional y robusto en su core** (Monitor + Telegram). El problema no es arquitectónico sino de **implementación incompleta de una feature** (Twilio personalizado). 

Está listo para que entres y arregles específicamente Twilio sin temor a romper el resto.

¿Quieres que te muestre el código específico de qué cambiar?
