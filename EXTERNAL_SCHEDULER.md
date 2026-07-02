# Scheduler externo para /api/watcher/check

## Por qué se usa un scheduler externo

El endpoint `/api/watcher/check` necesita ejecutarse cada minuto para detectar
cuándo un conector vigilado se libera y lanzar una llamada Twilio al operario.

Vercel Hobby solo permite **un cron job diario** en `vercel.json`. Registrar
`*/1 * * * *` en Vercel Cron viola ese límite y hace que el deployment falle.

Por eso `/api/watcher/check` se invoca desde un **scheduler externo**:

| Motivo | Detalle |
|--------|---------|
| Compatibilidad Vercel Hobby | El cron `*/1` no está en vercel.json |
| Vigilancia sin web abierta | El backend detecta liberaciones aunque el usuario cierre el navegador |
| Menor complejidad | No requiere polling desde el cliente ni WebSockets |
| Misma funcionalidad | Comportamiento idéntico al que tendría con Vercel Cron nativo |

---

## Configuración del scheduler

### 1. Variable de entorno

Añade en Vercel (Settings → Environment Variables):

```
CRON_SECRET=<mínimo 32 caracteres aleatorios>
```

Ejemplo de generación:
```bash
openssl rand -hex 32
```

### 2. URL a invocar

```
GET https://merida.hackerdepueblo.es/api/watcher/check?secret=<CRON_SECRET>
```

### 3. Frecuencia recomendada

**Cada 1 minuto.** Latencia de alerta máxima: ~60 segundos.

---

## Opciones de scheduler (sin preferencia por ninguna)

### cron-job.org (gratuito)
1. Crear cuenta en https://cron-job.org
2. Nuevo cron job → URL arriba → cada 1 minuto
3. Método: GET
4. Guardar

### EasyCron (gratuito con límites)
1. Crear cuenta en https://www.easycron.com
2. Add Cron Job → URL arriba → `* * * * *`
3. Guardar

### GitHub Actions (requiere repo)
```yaml
# .github/workflows/watcher-check.yml
name: Watcher Check
on:
  schedule:
    - cron: '* * * * *'
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -s "${{ secrets.APP_URL }}/api/watcher/check?secret=${{ secrets.CRON_SECRET }}"
```
Añadir `APP_URL` y `CRON_SECRET` como secretos del repositorio.

### Cualquier otro scheduler HTTP
- Método: `GET`
- URL: `https://merida.hackerdepueblo.es/api/watcher/check?secret=<CRON_SECRET>`
- Frecuencia: cada 1 minuto
- Timeout recomendado: 30 segundos

---

## Seguridad

- El parámetro `?secret` se valida en el endpoint antes de ejecutar ninguna lógica
- Si el secret no coincide, el endpoint devuelve `401 Unauthorized`
- Usa un valor aleatorio de al menos 32 caracteres para evitar fuerza bruta
- Rota el secret periódicamente si sospechas de uso no autorizado

---

## Verificación

Llama manualmente al endpoint para confirmar que funciona:

```bash
curl -s "https://merida.hackerdepueblo.es/api/watcher/check?secret=TU_SECRET" | jq
```

Respuesta esperada cuando no hay vigilancias activas:
```json
{ "success": true, "checked": 0, "calls_made": 0 }
```

Respuesta cuando hay vigilancias activas y no hay liberaciones:
```json
{ "success": true, "checked": 2, "calls_made": 0 }
```
