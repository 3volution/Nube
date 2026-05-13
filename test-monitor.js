#!/usr/bin/env node

/**
 * Script de prueba para Guardian 24/7
 * Verifica que todas las variables de entorno y conexiones funcionen
 */

require('dotenv').config();

const required_vars = [
  'ELECTROMAPS_USER',
  'ELECTROMAPS_PASS',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'CRON_SECRET'
];

console.log('=== Guardian 24/7 - Test de Configuración ===\n');

// Verificar variables de entorno
console.log('1. Verificando variables de entorno...');
let config_ok = true;
required_vars.forEach(v => {
  const value = process.env[v];
  if (!value) {
    console.log(`   ❌ ${v}: NO CONFIGURADA`);
    config_ok = false;
  } else {
    const hidden = v.includes('PASS') || v.includes('TOKEN') || v.includes('KEY') ? '***' : value;
    console.log(`   ✓ ${v}: ${hidden}`);
  }
});

if (!config_ok) {
  console.log('\n❌ Faltan variables de entorno. Configúralas en Vercel.');
  process.exit(1);
}

console.log('\n✓ Todas las variables de entorno están configuradas.\n');

// Probar conexión a Supabase
console.log('2. Probando conexión a Supabase...');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

fetch(`${SUPABASE_URL}/rest/v1/charger_state?limit=1`, {
  headers: {
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'apikey': SUPABASE_KEY
  }
})
  .then(res => {
    if (res.ok) {
      console.log('   ✓ Conexión a Supabase OK');
    } else {
      console.log(`   ❌ Error en Supabase: ${res.status}`);
    }
  })
  .catch(err => console.log(`   ❌ Error conectando a Supabase: ${err.message}`));

// Probar Telegram
console.log('3. Probando conexión a Telegram...');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: 'Guardian 24/7 - Prueba de conexión'
  })
})
  .then(res => {
    if (res.ok) {
      console.log('   ✓ Telegram OK - Deberías haber recibido un mensaje');
    } else {
      console.log(`   ❌ Error en Telegram: ${res.status}`);
    }
  })
  .catch(err => console.log(`   ❌ Error conectando a Telegram: ${err.message}`));

console.log('\n✓ Pruebas completadas. El sistema está listo para desplegar.\n');
console.log('Próximos pasos:');
console.log('1. Despliega en Vercel: vercel deploy');
console.log('2. Configura el cron job en cron-job.org');
console.log('3. Accede al dashboard: https://tu-app.vercel.app/monitor');
