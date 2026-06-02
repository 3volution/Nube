# DIAGNÓSTICO EXACTO DEL PREVIEW - INSTRUCCIONES

## Situación actual

He instrumentado el endpoint `/api/twilio/test-call` para devolver exactamente qué variables están llegando a Vercel Preview.

El endpoint devuelve un JSON con diagnostics:

```json
{
  "error": "Twilio credentials not configured",
  "diagnostics": {
    "accountSidConfigured": true/false,
    "authTokenConfigured": true/false,
    "fromNumberConfigured": true/false,
    "toNumberConfigured": true/false,
    "environment": "development/production"
  }
}
```

## Cómo obtener el diagnóstico definitivo

### Opción 1: Desde el navegador (La más directa)

1. **Abre el Preview de Vercel en el navegador:**
   - Ve a tu proyecto en GitHub
   - Haz clic en "Verifications" o busca el deployment de Vercel
   - Haz clic en "Visit Preview"
   - Copia la URL (ej: `https://nube-v0-3volution-xxx.vercel.app`)

2. **Abre la consola del navegador (F12 → Console)**

3. **Ejecuta este código:**

```javascript
fetch('https://TU-URL-PREVIEW/api/twilio/test-call', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
})
.then(r => r.json())
.then(d => {
  console.log('=== DIAGNÓSTICO EXACT DE VERCEL PREVIEW ===');
  console.log(JSON.stringify(d.diagnostics, null, 2));
  console.log('Error:', d.error);
})
.catch(e => console.error('Error:', e))
```

4. **Copia la salida JSON completa que apareza en la consola**

### Opción 2: Desde curl (Si tienes acceso SSH)

```bash
# Reemplaza con tu URL de preview
PREVIEW_URL="https://nube-v0-3volution-xxx.vercel.app"

curl -X POST "$PREVIEW_URL/api/twilio/test-call" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .diagnostics
```

## Qué espero ver

El endpoint retornará exactamente cuál de las 4 variables está en `false`:

```json
{
  "diagnostics": {
    "accountSidConfigured": true,
    "authTokenConfigured": true,
    "fromNumberConfigured": true,
    "toNumberConfigured": false,  ← ESTA ESTÁ FALTANDO
    "environment": "production"
  }
}
```

O podría ser:

```json
{
  "diagnostics": {
    "accountSidConfigured": true,
    "authTokenConfigured": true,
    "fromNumberConfigured": true,
    "toNumberConfigured": true,   ← TODAS CONFIGURADAS
    "environment": "production"
  }
}
```

## Qué es cada variable

- **accountSidConfigured**: ¿Existe `TWILIO_ACCOUNT_SID` en Vercel?
- **authTokenConfigured**: ¿Existe `TWILIO_AUTH_TOKEN` en Vercel?
- **fromNumberConfigured**: ¿Existe `TWILIO_PHONE_NUMBER` en Vercel?
- **toNumberConfigured**: ¿Existe `TWILIO_CALL_RECIPIENT` en Vercel?

## Próximos pasos

**Una vez obtengas la salida JSON:**

1. Cópiala exactamente como apareza
2. Indícame cuál es `false`
3. Yo identificaré si es un problema de:
   - Nombre de variable incorrecto
   - Variable no configurada en Vercel
   - Formato de la variable incorrecto
   - Otro problema

**NO haré merge ni deploy a producción hasta no tener este diagnóstico exacto.**
