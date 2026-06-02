import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const check = searchParams.get('check') || 'all';

    const diagnostics = {
      timestamp: new Date().toISOString(),
      version: 'V11.3',
      checks: {}
    };

    // Check 1: Environment variables
    if (check === 'all' || check === 'env') {
      diagnostics.checks.environment = {
        status: 'pending',
        variables: {
          SUPABASE_URL: process.env.SUPABASE_URL ? 'configured' : 'MISSING',
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured' : 'MISSING',
          ELECTROMAPS_USER: process.env.ELECTROMAPS_USER ? 'configured' : 'MISSING',
          ELECTROMAPS_PASS: process.env.ELECTROMAPS_PASS ? 'configured' : 'MISSING',
          TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'MISSING',
          TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'configured' : 'MISSING',
          TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER ? 'configured' : 'MISSING',
          TWILIO_CALL_RECIPIENT: process.env.TWILIO_CALL_RECIPIENT ? 'configured' : 'MISSING',
          CRON_SECRET: process.env.CRON_SECRET ? 'configured' : 'MISSING'
        },
        missingVars: [
          !process.env.SUPABASE_URL && 'SUPABASE_URL',
          !process.env.SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
          !process.env.ELECTROMAPS_USER && 'ELECTROMAPS_USER',
          !process.env.ELECTROMAPS_PASS && 'ELECTROMAPS_PASS',
          !process.env.TWILIO_ACCOUNT_SID && 'TWILIO_ACCOUNT_SID',
          !process.env.TWILIO_AUTH_TOKEN && 'TWILIO_AUTH_TOKEN',
          !process.env.TWILIO_PHONE_NUMBER && 'TWILIO_PHONE_NUMBER',
          !process.env.TWILIO_CALL_RECIPIENT && 'TWILIO_CALL_RECIPIENT',
          !process.env.CRON_SECRET && 'CRON_SECRET'
        ].filter(Boolean)
      };
      diagnostics.checks.environment.status = diagnostics.checks.environment.missingVars.length === 0 ? 'pass' : 'fail';
    }

    // Check 2: Supabase connection
    if (check === 'all' || check === 'supabase') {
      try {
        const { count, error } = await supabase
          .from('active_watchers')
          .select('*', { count: 'exact', head: true });

        diagnostics.checks.supabase = {
          status: error ? 'fail' : 'pass',
          message: error ? error.message : 'Connection successful',
          table_exists: !error,
          active_watchers_count: count || 0
        };
      } catch (err) {
        diagnostics.checks.supabase = {
          status: 'fail',
          message: err.message
        };
      }
    }

    // Check 3: Twilio credentials
    if (check === 'all' || check === 'twilio') {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;
        const toNumber = process.env.TWILIO_CALL_RECIPIENT;

        const allConfigured = accountSid && authToken && fromNumber && toNumber;

        diagnostics.checks.twilio = {
          status: allConfigured ? 'pass' : 'fail',
          configured: {
            TWILIO_ACCOUNT_SID: !!accountSid,
            TWILIO_AUTH_TOKEN: !!authToken,
            TWILIO_PHONE_NUMBER: !!fromNumber,
            TWILIO_CALL_RECIPIENT: !!toNumber
          },
          from_number: fromNumber || 'NOT SET',
          to_number: toNumber || 'NOT SET',
          message: allConfigured 
            ? 'All Twilio variables configured'
            : 'Missing Twilio variables - check .env'
        };

        // Try to import Twilio to verify it's installed
        try {
          require('twilio');
          diagnostics.checks.twilio.twilio_package = 'installed';
        } catch {
          diagnostics.checks.twilio.twilio_package = 'NOT INSTALLED';
          diagnostics.checks.twilio.status = 'fail';
        }
      } catch (err) {
        diagnostics.checks.twilio = {
          status: 'fail',
          message: err.message
        };
      }
    }

    // Check 4: Active watchers in database
    if (check === 'all' || check === 'watchers') {
      try {
        const { data: watchers, error } = await supabase
          .from('active_watchers')
          .select('id, station_id, station_name, status, retry_count')
          .order('created_at', { ascending: false })
          .limit(10);

        diagnostics.checks.watchers = {
          status: error ? 'fail' : 'pass',
          message: error ? error.message : `Found ${watchers?.length || 0} watchers`,
          by_status: {
            active: watchers?.filter(w => w.status === 'active').length || 0,
            completed: watchers?.filter(w => w.status === 'completed').length || 0,
            failed: watchers?.filter(w => w.status === 'failed').length || 0,
            cancelled: watchers?.filter(w => w.status === 'cancelled').length || 0
          },
          recent_watchers: watchers || []
        };
      } catch (err) {
        diagnostics.checks.watchers = {
          status: 'fail',
          message: err.message
        };
      }
    }

    // Check 5: Recent state changes
    if (check === 'all' || check === 'state-changes') {
      try {
        const { data: changes, error } = await supabase
          .from('connector_state_changes')
          .select('connector_id, station_name, estado_anterior, estado_nuevo, tiempo_en_estado_anterior_segundos, timestamp')
          .order('timestamp', { ascending: false })
          .limit(20);

        diagnostics.checks.state_changes = {
          status: error ? 'fail' : 'pass',
          message: error ? error.message : `Found ${changes?.length || 0} state changes`,
          total_records: changes?.length || 0,
          duration_check: changes && changes.length > 0 ? {
            min_duration_seconds: Math.min(...changes.map(c => c.tiempo_en_estado_anterior_segundos || 0)),
            max_duration_seconds: Math.max(...changes.map(c => c.tiempo_en_estado_anterior_segundos || 0)),
            avg_duration_seconds: Math.round(
              changes.reduce((sum, c) => sum + (c.tiempo_en_estado_anterior_segundos || 0), 0) / changes.length
            ),
            warning: changes.some(c => c.tiempo_en_estado_anterior_segundos === 60 || c.tiempo_en_estado_anterior_segundos === 61)
              ? 'Found durations ~60s - may indicate pre-V11.2 bug'
              : 'Durations look correct'
          } : 'No state changes found',
          recent_changes: changes?.slice(0, 5) || []
        };
      } catch (err) {
        diagnostics.checks.state_changes = {
          status: 'fail',
          message: err.message
        };
      }
    }

    // Overall status
    const allPassed = Object.values(diagnostics.checks).every(check => check.status === 'pass');
    diagnostics.overall_status = allPassed ? 'PASS - Ready for deployment' : 'FAIL - Fix issues above';

    return Response.json(diagnostics);
  } catch (error) {
    return Response.json(
      { error: error.message, status: 'CRITICAL' },
      { status: 500 }
    );
  }
}
