import twilio from 'twilio';

export async function POST(request) {
  try {
    // Aceptar phoneNumber desde body o query
    const { phoneNumber: bodyPhoneNumber } = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const queryPhoneNumber = searchParams.get('phoneNumber');
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    const toNumber = bodyPhoneNumber || queryPhoneNumber || process.env.TWILIO_CALL_RECIPIENT;

    console.log('[v0] Test call - from:', fromNumber, 'to:', toNumber);

    if (!accountSid || !authToken || !fromNumber) {
      console.error('[v0] Credenciales Twilio incompletas');
      return Response.json(
        { error: 'Twilio credentials not configured' },
        { status: 500 }
      );
    }

    if (!toNumber) {
      console.error('[v0] Número de teléfono destino no especificado');
      return Response.json(
        { error: 'Destination phone number not specified. Use ?phoneNumber=+34XXXXXXXXX or post { phoneNumber: "+34XXXXXXXXX" }' },
        { status: 400 }
      );
    }

    const client = twilio(accountSid, authToken);

    const call = await client.calls.create({
      twiml: '<Response><Say language="es-ES">Hola Nacho. Esta es una llamada de prueba del sistema de monitoreo de cargadores. El sistema funciona correctamente. Hasta luego.</Say></Response>',
      to: toNumber,
      from: fromNumber
    });

    console.log('[v0] Test call exitosa:', call.sid);

    return Response.json({ 
      success: true,
      message: 'Llamada de prueba iniciada',
      callSid: call.sid,
      to: toNumber,
      from: fromNumber
    });
  } catch (error) {
    console.error('[v0] Error en test-call:', error.message);
    return Response.json(
      { error: error.message || 'Error al hacer la llamada' },
      { status: 500 }
    );
  }
}
