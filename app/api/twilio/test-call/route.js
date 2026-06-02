import twilio from 'twilio';

export async function POST() {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    const toNumber = '+34607373373';

    // DIAGNÓSTICO TEMPORAL: Verificar qué variables están llegando
    const diagnostics = {
      accountSidConfigured: !!accountSid,
      authTokenConfigured: !!authToken,
      fromNumberConfigured: !!fromNumber,
      environment: process.env.NODE_ENV || 'unknown'
    };

    if (!accountSid || !authToken || !fromNumber) {
      return Response.json(
        { 
          error: 'Twilio credentials not configured',
          diagnostics: diagnostics
        },
        { status: 500 }
      );
    }

    const client = twilio(accountSid, authToken);

    const call = await client.calls.create({
      twiml: '<Response><Say language="es-ES">Hola Nacho. Esta es una llamada de prueba del sistema de monitoreo de cargadores. El sistema funciona correctamente. Hasta luego.</Say></Response>',
      to: toNumber,
      from: fromNumber
    });

    console.log('[v0] Test call initiated:', call.sid);

    return Response.json({ 
      success: true, 
      message: 'Llamada de prueba iniciada',
      callSid: call.sid,
      diagnostics: diagnostics
    });
  } catch (error) {
    console.error('[v0] Error making test call:', error);
    return Response.json(
      { error: error.message || 'Error al hacer la llamada' },
      { status: 500 }
    );
  }
}
