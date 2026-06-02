# V11.3 PROPUESTA FINAL DE IMPLEMENTACIÓN

## 1. FLUJO E2E COMPLETO ACTUALIZADO

```
USUARIO EN UI (Monitor Page)
    ↓
[Usuario pulsa "Vigilar" en estación]
    ↓
WatcherModal se abre
    ├─ [Sección nueva] Prueba Twilio:
    │  ├─ Campo: "Número destino" (editable, prefill desde env)
    │  ├─ Botón: "Probar Llamada"
    │  └─ Estado: "Enviando..." → "✓ Éxito" | "✗ Error: [mensaje]"
    │
    └─ [Flujo original] Código Nacho:
       ├─ Usuario introduce "NACHO"
       ├─ POST /api/watcher
       └─ → INSERT active_watchers con:
          ├─ station_id
          ├─ station_name
          ├─ last_connector_states (snapshot)
          ├─ status = 'active'
          ├─ retry_count = 0
          └─ [NO phone_number] ← Usar env global

UI ACTUALIZACIÓN (cada 30s)
    ├─ GET /api/watcher
    └─ Si status='active': fondo amarillo, botón "Ver vigilancia"

CRON EXTERNO (cada 1 minuto, configurado por usuario en cron-job.org)
    ├─ GET /api/watcher/check?secret=CRON_SECRET
    ├─ SELECT watchers WHERE status='active'
    │
    └─ Para cada vigilancia:
       ├─ Consulta Electromaps
       ├─ Compara vs last_connector_states
       ├─ ¿OCCUPIED → FREE?
       │  │
       │  ├─ SÍ:
       │  │  ├─ await sendNotification(
       │  │  │   process.env.TWILIO_CALL_RECIPIENT,  ← VARIABLE NUEVA
       │  │  │   watcher.station_name
       │  │  │ )
       │  │  ├─ ¿Exitoso?
       │  │  │  ├─ SÍ: UPDATE status='completed'
       │  │  │  └─ NO: INCREMENT retry_count
       │  │  │         Si >= 5: status='failed'
       │  │  │
       │  │  └─ Retorna { checked: 1, calls_made: 1 }
       │  │
       │  └─ NO:
       │     ├─ UPDATE last_connector_states
       │     └─ Continuamos esperando

RESULTADO FINAL
    ├─ Si éxito: status='completed' → UI marca vigilancia terminada
    ├─ Si error: status='failed' → Usuario ve "Llamada falló"
    └─ Si cancelación manual: status='cancelled'
```

---

## 2. VARIABLES DE ENTORNO DEFINITIVAS

### Existentes (sin cambio):
```
ELECTROMAPS_USER          → Login Electromaps
ELECTROMAPS_PASS          → Password Electromaps
SUPABASE_URL              → URL Supabase
SUPABASE_ANON_KEY         → Clave anónima
SUPABASE_SERVICE_ROLE_KEY → Clave servidor
TWILIO_ACCOUNT_SID        → Account ID Twilio
TWILIO_AUTH_TOKEN         → Token Twilio
TWILIO_PHONE_NUMBER       → Número origen (desde qué número hace la llamada)
CRON_SECRET               → Token para /api/watcher/check
TELEGRAM_BOT_TOKEN        → Token bot (si se usa)
TELEGRAM_CHAT_ID          → Chat ID (si se usa)
```

### NUEVO en V11.3:
```
TWILIO_CALL_RECIPIENT     → Número destino (a dónde recibe la llamada)
                            Ej: +34612345678
                            Requerido: SÍ (para watchers)
```

### Resumen:
- 12 variables existentes (sin cambios)
- 1 variable nueva: `TWILIO_CALL_RECIPIENT`
- Total: 13 variables en `.env.example`

---

## 3. DISEÑO VISUAL DEL BLOQUE "PROBAR LLAMADA TWILIO"

```
┌──────────────────────────────────────────────────────┐
│  PRUEBA DE NOTIFICACIÓN TWILIO                       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Número destino:                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ +34612345678                                 │   │
│  └──────────────────────────────────────────────┘   │
│  (editable, prefill desde env)                      │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ ▶ Probar Llamada        Estado: Listo        │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  Resultado:                                          │
│  ┌──────────────────────────────────────────────┐   │
│  │ ✓ Llamada enviada correctamente              │   │
│  │ (o error específico si falla)                │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
└──────────────────────────────────────────────────────┘

Ubicación: Sección FIJA en modal, siempre visible
Estilos: bg-slate-700, botón azul, resultado verde/rojo
```

---

## 4. LISTA FINAL DE ARCHIVOS MODIFICADOS/CREADOS

### MODIFICADOS (6 archivos):
| Archivo | Cambios | Líneas |
|---------|---------|--------|
| `app/api/watcher/check/route.js` | Cambiar firma sendNotification | 1 |
| `app/components/WatcherModal.tsx` | Añadir sección prueba | +80 |
| `app/config/version.ts` | V11.3 | 1 |
| `README.md` | Doc cron externo | +40 |
| `.env.example` | Variables (NUEVO archivo) | 30 |
| `package.json` | Sin cambios | 0 |

### CREADOS (3 archivos código + 3 documentación):
| Archivo | Tipo | Líneas |
|---------|------|--------|
| `app/api/watcher/diagnose/route.js` | Código | 184 |
| `.env.example` | Config | 30 |
| `V11_3_DESIGN.md` | Doc | 309 |
| `V11_3_TEST_PLAN.md` | Doc | 362 |
| `V11_3_VALIDATION_GUIDE.md` | Doc | 251 |

### Resumen:
- 6 archivos modificados
- 3 archivos código nuevo
- 3 documentos
- ~220 líneas código
- ~920 líneas documentación

---

## 5. VALIDACIÓN FUNCIONAL - CHECKLIST RESUMEN

### Fase 1: Configuración
```
[ ] Variables: TWILIO_CALL_RECIPIENT, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
[ ] GET /api/watcher/diagnose → PASS
```

### Fase 2: UI - Botón Twilio
```
[ ] Modal abre sin errores
[ ] Campo número editable
[ ] Botón "Probar Llamada" funciona
[ ] Recibir llamada real
[ ] Resultado "✓ Éxito" en modal
```

### Fase 3: Vigilancia
```
[ ] Usuario hace clic "Vigilar"
[ ] POST /api/watcher exitoso
[ ] active_watchers.status = 'active'
```

### Fase 4: Transición
```
[ ] Ocupar cargador (Telegram /ocupar)
[ ] Liberar cargador (Telegram /liberar)
[ ] connector_state_changes registra correctamente
[ ] tiempo_en_estado_anterior_segundos > 60 (confirmado V11.2)
```

### Fase 5: Cron simulada
```
[ ] GET /api/watcher/check?secret=CRON_SECRET
[ ] Respuesta: { checked: 1, calls_made: 1 }
[ ] Recibir llamada Twilio
[ ] active_watchers.status = 'completed'
```

### Fase 6: Manejo de errores
```
[ ] Sin TWILIO_CALL_RECIPIENT → botón deshabilitado
[ ] Número inválido → error 400
[ ] Fallo x5 → status='failed'
```

---

## RESUMEN EJECUTIVO

| Aspecto | Valor |
|---------|-------|
| Versión | V11.3 |
| Código nuevo | ~220 líneas |
| Archivos modificados | 6 |
| Archivos nuevos | 3 (código) |
| Variables nuevas | 1 |
| Breaking changes | 0 |
| Complejidad | Baja |

**¿Apruebas esta propuesta final de V11.3?**
