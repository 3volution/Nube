# Scheduler externo para /api/watcher/check

## Por qué se usa un scheduler externo

El endpoint `/api/watcher/check` necesita ejecutarse cada minuto para detectar
cuándo un conector vigilado se libera y lanzar una llamada Twilio al operario.

Vercel Hobby solo permite **un cron job diario** en `vercel.json`. Por eso
`/api/watcher/check` **no está en `vercel.json`** y se invoca desde un
scheduler HTTP externo que puede ser cualquier servicio o herramienta:

| Ventaja | Detalle |
|---------|---------|
| Compatible con Vercel Hobby | Sin crons adicionales en vercel.json |
| Vigilancia sin web abierta | El backend detecta liberaciones aunque el usuario cierre el navegador |
| Sin acoplamiento | El endpoint acepta cualquier cliente HTTP |
| Sin coste adicional | La mayoría de schedulers externos tienen plan gratuito |

---

## Paso 1 — Actualizar CRON_SECRET en Vercel

El `CRON_SECRET` actual debe rotarse. El nuevo valor generado criptográficamente es:

```
615bb757a3c27785d26a4ac08f58ae65d7adf41bc098ea27d4e58f4d0b71aeee
```

**Dónde actualizarlo:**

1. Ir a https://vercel.com → proyecto `v0-electric-charger-monitor` → **Settings → Environment Variables**
2. Localizar la variable `CRON_SECRET`
3. Editar su valor y sustituirlo por el de arriba
4. Marcar los entornos: **Production**, Preview, Development
5. Guardar

> Para generar un nuevo secreto en cualquier momento: `openssl rand -hex 32`

---

## Paso 2 — URL a invocar

```
GET https://merida.hackerdepueblo.es/api/watcher/check?secret=615bb757a3c27785d26a4ac08f58ae65d7adf41bc098ea27d4e58f4d0b71aeee
```

- Método: `GET`
- Frecuencia: **cada 1 minuto**
- Timeout recomendado: 30 segundos
- Respuesta esperada (sin vigilancias activas): `{"success":true,"checked":0,"calls_made":0}`

---

## Paso 3 — Elegir un scheduler (cualquiera de estos es válido)

### Opción A: cron-job.org (gratuito, sin límite de frecuencia)

1. Crear cuenta en https://cron-job.org
2. Dashboard → **Create cronjob**
3. URL: pegar la URL del Paso 2
4. Schedule: seleccionar **Every minute**
5. Request method: **GET**
6. Guardar y activar

### Opción B: EasyCron (gratuito con hasta 20 jobs)

1. Crear cuenta en https://www.easycron.com
2. **Add Cron Job**
3. URL: pegar la URL del Paso 2
4. Cron expression: `* * * * *`
5. Guardar

### Opción C: GitHub Actions (requiere que el repositorio sea público o tener plan GitHub)

Crear el archivo `.github/workflows/watcher-check.yml` en el repositorio:

```yaml
name: Watcher Check
on:
  schedule:
    - cron: '* * * * *'
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Invoke watcher endpoint
        run: |
          curl -s --max-time 25 \
            "https://merida.hackerdepueblo.es/api/watcher/check?secret=${{ secrets.CRON_SECRET }}"
```

Añadir en GitHub → repositorio → **Settings → Secrets → Actions**:
- `CRON_SECRET` = valor del Paso 1

> Nota: GitHub Actions tiene una precisión de ~1 minuto pero no garantiza ejecución exacta al segundo.

### Opción D: Cualquier otro scheduler HTTP

El endpoint acepta cualquier cliente que envíe:

```
GET <base_url>/api/watcher/check?secret=<CRON_SECRET>
```

No hay dependencia de ningún proveedor concreto.

---

## Verificación manual

Después de actualizar `CRON_SECRET` en Vercel y configurar el scheduler, verifica manualmente:

```bash
# Secreto correcto → debe devolver 200
curl -s "https://merida.hackerdepueblo.es/api/watcher/check?secret=615bb757a3c27785d26a4ac08f58ae65d7adf41bc098ea27d4e58f4d0b71aeee"

# Secreto incorrecto → debe devolver 401
curl -s "https://merida.hackerdepueblo.es/api/watcher/check?secret=wrongsecret"
```

---

## Seguridad

- El `?secret` se valida **antes** de ejecutar ninguna lógica de negocio
- Un secret incorrecto devuelve `401 Unauthorized` inmediatamente
- Usar siempre HTTPS (nunca HTTP)
- Rotar el secret periódicamente actualizando: Vercel env var + scheduler externo
