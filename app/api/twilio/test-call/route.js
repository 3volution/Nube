import twilio from 'twilio';

export async function POST() {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    const toNumber = process.env.TWILIO_CALL_RECIPIENT;

    if (!accountSid || !authToken || !fromNumber || !toNumber) {
      return Response.json(
        { error: 'Twilio credentials not configured' },
        { status: 500 }
      );
    }

    const client = twilio(accountSid, authToken);

    const call = await client.calls.create({
      twiml: '<Response><Say language="es-ES">Hola Nacho. Esta es una llamada de prueba del sistema de monitoreo de cargadores. El sistema funciona correctamente. Hasta luego.</Say></Response>',
      to: toNumber,
      from: fromNumber
    });

    return Response.json({ 
      success: true,
      message: 'Llamada de prueba iniciada',
      callSid: call.sid
    });
  } catch (error) {
    console.error('Error en test-call:', error.message);
    return Response.json(
      { error: error.message || 'Error al hacer la llamada' },
      { status: 500 }
    );
  }
}
