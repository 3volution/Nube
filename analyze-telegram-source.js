const https = require('https');

// Load env vars
require('dotenv').config({ path: '/vercel/share/.env.project' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

async function querySupabase(table, query) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const options = {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function analyzeConnectorChanges() {
  console.log('Fetching connector_state_changes from Supabase...\n');
  
  try {
    // Get recent changes
    const changes = await querySupabase('connector_state_changes', {
      'order': 'detected_at.desc',
      'limit': '100'
    });

    console.log(`Found ${changes.length} state changes\n`);

    // Group by timestamp to find correlations
    const byHour = {};
    changes.forEach(change => {
      const hour = new Date(change.detected_at).toISOString().slice(0, 13);
      if (!byHour[hour]) byHour[hour] = [];
      byHour[hour].push(change);
    });

    console.log('Changes by hour:\n');
    Object.entries(byHour).forEach(([hour, items]) => {
      console.log(`${hour}:00 - ${items.length} changes`);
      items.slice(0, 3).forEach(item => {
        console.log(`  ${item.connector_id}: ${item.estado_anterior} → ${item.estado_nuevo}`);
      });
    });

    // Look for OCCUPIED → FREE transitions (these trigger Telegram)
    const liberations = changes.filter(c => 
      c.estado_anterior === 'OCCUPIED' && c.estado_nuevo === 'FREE'
    );

    console.log(`\n\nFound ${liberations.length} liberations (OCCUPIED → FREE):\n`);
    
    liberations.slice(0, 10).forEach(lib => {
      const timestamp = new Date(lib.detected_at);
      console.log(`Connector ${lib.connector_id}:`);
      console.log(`  Time: ${timestamp.toLocaleTimeString('es-ES')}`);
      console.log(`  Source: ${lib.source || 'unknown'}`);
      console.log(`  Detected at: ${lib.detected_at}`);
      console.log();
    });

    // Check charger_state table
    console.log('\n\nFetching charger_state table...');
    const chargerStates = await querySupabase('charger_state', {
      'limit': '50',
      'order': 'last_status_change.desc'
    });

    console.log(`Found ${chargerStates.length} charger states\n`);
    chargerStates.slice(0, 5).forEach(state => {
      console.log(`Station ${state.station_id}:`);
      console.log(`  Connector ${state.connector_id}: ${state.status}`);
      console.log(`  Last change: ${state.last_status_change}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

analyzeConnectorChanges();
