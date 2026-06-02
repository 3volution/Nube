export async function GET() {
  return Response.json({
    TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: !!process.env.TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER: !!process.env.TWILIO_PHONE_NUMBER,
    TWILIO_CALL_RECIPIENT: !!process.env.TWILIO_CALL_RECIPIENT,
    VERCEL_ENV: process.env.VERCEL_ENV || 'unknown'
  });
}
