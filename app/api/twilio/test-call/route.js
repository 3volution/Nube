import twilio from 'twilio';

export async function POST() {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    const toNumber = process.env.TWILIO_CALL_RECIPIENT;

    if (!accountSid || !authToken || !fromNumber || !toNumber) {
      return Response.json(
        { 
          error: 'Twilio credentials not configured',
          missing: {
            accountSid: !accountSid,
            authToken: !authToken,
            fromNumber: !fromNumber,
            toNumber: !toNumber
          }
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

    // RESPUESTA COMPLETA DE TWILIO - INSTRUMENTACIÓN TEMPORAL
    return Response.json({ 
      success: true,
      message: 'Llamada de prueba iniciada',
      callSid: call.sid,
      callStatus: call.status,
      callTo: call.to,
      callFrom: call.from,
      callAccountSid: call.accountSid,
      callDateCreated: call.dateCreated,
      callDateUpdated: call.dateUpdated,
      callDirection: call.direction,
      callDuration: call.duration,
      callPrice: call.price,
      callPriceUnit: call.priceUnit,
      callSid: call.sid
    });
  } catch (error) {
    console.error('[v0] Error making test call:', error);
    
    // RESPUESTA COMPLETA DEL ERROR - INSTRUMENTACIÓN TEMPORAL
    return Response.json(
      { 
        success: false,
        error: error.message || 'Error al hacer la llamada',
        errorCode: error.code,
        errorStatus: error.status,
        errorMessage: error.message,
        moreInfo: error.moreInfo,
        errorDetails: {
          name: error.name,
          statusCode: error.statusCode,
          message: error.message
        }
      },
      { status: 500 }
    );
  }
}
