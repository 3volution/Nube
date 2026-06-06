// Script de diagnóstico - ejecutar con las env vars completas de Vercel
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

(async () => {
  // 1. Leer vigilancia
  const { data: watchers, error } = await supabase
    .from('active_watchers')
    .select('*')
    .eq('station_id', '828538')
    .eq('status', 'active');

  if (error) { console.log('ERROR:', error.message); return; }
  if (!watchers?.length) { console.log('SIN VIGILANCIAS para 828538'); return; }

  const w = watchers[0];
  console.log('last_connector_states:', JSON.stringify(w.last_connector_states, null, 2));

  // 2. Obtener estados Electromaps
  const url = `https://www.electromaps.com/api/v1/chargers/${w.station_id}/connectors`;
  const resp = await fetch(url, {
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${process.env.ELECTROMAPS_USER}:${process.env.ELECTROMAPS_PASS}`).toString('base64'),
    }
  });
  const conectores = await resp.json();

  const currentStates = {};
  conectores.forEach(c => { currentStates[c.id] = c.status; });
  console.log('currentStates:', JSON.stringify(currentStates, null, 2));

  // 3. Evaluar
  const prev = w.last_connector_states || {};
  let freed = false;
  for (const id of Object.keys(currentStates)) {
    const p = prev[id], c = currentStates[id];
    const match = p === 'OCCUPIED' && (c === 'FREE' || c === 'AVAILABLE');
    console.log(`Conector ${id}: ${p||'undefined'} -> ${c} | match=${match}`);
    if (match) freed = true;
  }

  console.log('freedConnectorFound:', freed);
  console.log('TWILIO_CALL_RECIPIENT:', process.env.TWILIO_CALL_RECIPIENT || 'VACIO');
})();
