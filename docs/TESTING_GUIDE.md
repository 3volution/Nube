// Testing guide for the complete monitoring cascade system
// This file documents all testing scenarios for the charger monitoring feature

## Prerequisites
- All environment variables configured (TELEGRAM_BOT_TOKEN, TWILIO_*, CRON_SECRET)
- Database migration applied (charger_monitoring table created)
- Application deployed

## Test Scenarios

### Test 1: Start Monitoring - API Endpoint
**Endpoint:** POST /api/monitoring
**Purpose:** Verify that monitoring can be started for a station

**Request:**
```json
{
  "station_id": "828524",
  "station_name": "Avda. Roma",
  "phone_number": "+34612345678",
  "telegram_chat_id": "123456789",
  "notification_methods": ["telegram", "sms", "twilio"],
  "duration_minutes": 120
}
```

**Expected Response:**
- Status: 201 Created
- Response body contains monitoring ID, start_time, is_active=true
- Entry created in charger_monitoring table

**Verification:**
- Check Supabase: SELECT * FROM charger_monitoring WHERE station_id = '828524' AND is_active = true;
- Confirm all fields stored correctly

---

### Test 2: Get Active Monitorings
**Endpoint:** GET /api/monitoring
**Purpose:** Retrieve list of active monitoring sessions

**Expected Response:**
- Status: 200 OK
- Array of active monitoring records
- Each record includes station_id, status, time_remaining

---

### Test 3: Stop Monitoring - API Endpoint
**Endpoint:** DELETE /api/monitoring/{id}
**Purpose:** Stop an active monitoring session

**Expected Response:**
- Status: 200 OK
- Monitoring marked as is_active = false
- found_available remains false (manual stop)

**Verification:**
- Check Supabase: SELECT is_active FROM charger_monitoring WHERE id = '{id}';
- Should return false

---

### Test 4: Telegram Notification Cascade (Level 1)
**Scenario:** Charger becomes available while Telegram is configured and working
**Trigger:** Manual change connector status in Electromaps or test data

**Expected Behavior:**
1. Worker checks at :00 seconds each minute
2. Detects OCUPADO → LIBRE transition
3. Sends 10 Telegram messages with 5-second delay
4. Each message says: "🚗 DISPONIBLE EN Avda. Roma - Cargador libre. Tienes 120 minutos para llegar"
5. Updates alerts_sent = {telegram: success}
6. Marks found_available = true
7. Sets is_active = false

**Manual Verification:**
- Check Telegram: Receive 10 rapid messages on your bot chat
- Check Supabase alerts_sent for notification method used
- Confirm found_at timestamp is recent

---

### Test 5: SMS Fallback (Level 2)
**Scenario:** Telegram fails or not configured, SMS should trigger

**Setup:** 
- Remove telegram_chat_id or disable Telegram Bot Token temporarily
- Start monitoring with SMS configured

**Expected Behavior:**
1. Charger becomes available
2. Worker attempts Telegram → fails (no chat_id)
3. Falls back to SMS
4. Sends SMS: "DISPONIBLE: Avda. Roma. Cargador libre. Tienes 120 minutos."
5. updates alerts_sent = {telegram: failed, sms: success}

**Manual Verification:**
- Check SMS received on phone_number
- Verify alerts_sent shows SMS fallback was used
- Confirm is_active = false after SMS sent

---

### Test 6: Twilio Voice Fallback (Level 3)
**Scenario:** Both Telegram and SMS fail, Twilio Voice Call should trigger

**Setup:**
- Remove both Telegram and SMS configurations
- Start monitoring with Twilio configured
- Ensure phone_number is valid Twilio number

**Expected Behavior:**
1. Charger becomes available
2. Worker attempts Telegram → fails
3. Falls back to SMS → fails
4. Falls back to Twilio Voice Call
5. Call plays: "Se ha detectado un cargador disponible en Avda. Roma. Tienes 120 minutos para recoger tu coche"
6. Updates alerts_sent = {telegram: failed, sms: failed, twilio: success}

**Manual Verification:**
- Phone rings with automated message
- alerts_sent shows full cascade with Twilio success
- is_active = false and found_available = true

---

### Test 7: Auto-Stop on Availability
**Scenario:** Verify that monitoring automatically stops when availability is detected

**Expected Behavior:**
1. Start monitoring for a station
2. Charger becomes available (any notification method works)
3. After sending alert, worker sets:
   - is_active = false
   - found_available = true
   - found_at = NOW()
4. Monitoring session ends

**Verification:**
- Check Supabase: SELECT is_active, found_available, found_at FROM charger_monitoring WHERE id = '{id}';
- All three fields should have correct values
- found_at should be very recent

---

### Test 8: Multiple Simultaneous Monitorings
**Scenario:** Monitor multiple stations at once

**Setup:**
1. Start monitoring for "Avda. Roma" (828524)
2. Start monitoring for "Plaza Xirgu" (828523)
3. Both should be active simultaneously

**Expected Behavior:**
1. Worker checks all active monitorings
2. If both chargers become available, both alerts trigger
3. Each gets its own notification cascade independently
4. Both auto-stop after detection

**Verification:**
- SELECT COUNT(*) FROM charger_monitoring WHERE is_active = true;
- Should show 2 records
- Each should have independent alert history

---

### Test 9: Duration Limit
**Scenario:** Monitoring should auto-stop after duration expires

**Setup:**
- Start monitoring with duration_minutes = 2
- Don't change charger status

**Expected Behavior (after 2 minutes):**
1. Worker checks at :01, :02 minutes mark
2. Detects start_time + duration > NOW()
3. Sets is_active = false, found_available = false (timeout)
4. Does NOT send alert

**Verification:**
- Wait 2+ minutes
- Check Supabase: is_active should be false
- found_available should be false
- No alerts should be in alerts_sent

---

### Test 10: Frontend Integration
**Scenario:** UI elements work correctly

**Expected Behavior:**
1. Click bell icon (🔔) on station header
2. Modal opens with notification method selection
3. Can select Telegram, SMS, Twilio
4. Can enter phone number
5. Can select duration (30, 60, 90, 120 min)
6. Submit creates monitoring session via API
7. Button changes to "Monitoreando..." and disables
8. MonitoringBadge shows countdown timer
9. When charger becomes available, modal closes and user sees notification

**Manual Verification:**
- UI responsive and intuitive
- Form validation works
- Badge updates correctly
- No console errors

---

## Troubleshooting

### Issue: Telegram messages not received
- Verify TELEGRAM_BOT_TOKEN is correct
- Confirm telegram_chat_id is correct (use /getid command in Telegram)
- Check Telegram Bot API status

### Issue: SMS not sent
- Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct
- Check TWILIO_PHONE_NUMBER is Twilio number, not receiving number
- Verify phone_number in request is valid with country code

### Issue: Calls not connecting
- Verify TWILIO_AUTH_TOKEN is correct
- Check TWILIO_PHONE_NUMBER is correctly formatted
- Ensure receiving phone_number is in correct format with country code

### Issue: Worker not running
- Verify CRON_SECRET environment variable is set
- Check /api/cron/check-chargers endpoint exists
- Verify endpoint is called with correct Authorization header
- Check Vercel Crons configuration

### Issue: Monitoring not stopping
- Verify database connection is working
- Check supabase.from('charger_monitoring').update() queries in worker
- Check for database permission errors in logs

---

## Success Criteria
- All 10 tests pass
- Cascade flow works correctly (Telegram → SMS → Twilio)
- Auto-stop functionality verified
- Duration limits respected
- Frontend UI fully functional
- Multiple simultaneous monitorings work
- No console errors or database errors
