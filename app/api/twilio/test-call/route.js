import twilio from 'twilio';

export async function POST() {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    const toNumber = process.env.TWILIO_CALL_RECIPIENT;

    // DIAGNÓSTICO DETALLADO TEMPORAL - RETORNO INMEDIATO
    const diagnosticsDetailed = {
      accountSidConfigured: !!accountSid,
      authTokenConfigured: !!authToken,
      fromNumberConfigured: !!fromNumber,
      toNumberConfigured: !!toNumber,
      accountSidLength: accountSid?.length || 0,
      authTokenLength: authToken?.length || 0,
      fromNumberLength: fromNumber?.length || 0,
      toNumberLength: toNumber?.length || 0,
      vercelEnv: process.env.VERCEL_ENV
    };

    // RETORNAR DIAGNÓSTICO INMEDIATO SIN CONTINUAR
    return Response.json(diagnosticsDetailed);


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
