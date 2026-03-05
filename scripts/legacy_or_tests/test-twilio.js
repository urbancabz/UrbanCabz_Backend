// test-twilio.js
// Standalone script to test WhatsApp via Twilio without full booking flow.

require('dotenv').config();

const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM,
  TWILIO_RESET_CONTENT_SID,
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
  console.error(
    'Missing Twilio env vars. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM in .env'
  );
  process.exit(1);
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

async function sendTest() {
  try {
    const to = process.env.TWILIO_TEST_WHATSAPP_TO;

    if (!to) {
      console.error(
        'Please set TWILIO_TEST_WHATSAPP_TO in .env, e.g. whatsapp:+91XXXXXXXXXX'
      );
      process.exit(1);
    }

    console.log('Sending WhatsApp test message to:', to, 'using contentSid:', TWILIO_RESET_CONTENT_SID);

    let message;
    if (TWILIO_RESET_CONTENT_SID) {
      const otp = '123456';
      const contentVariables = JSON.stringify({ 1: otp });
      message = await client.messages.create({
        from: TWILIO_WHATSAPP_FROM, // e.g. 'whatsapp:+14155238886'
        to,
        contentSid: TWILIO_RESET_CONTENT_SID,
        contentVariables,
      });
    } else {
      message = await client.messages.create({
        from: TWILIO_WHATSAPP_FROM, // e.g. 'whatsapp:+14155238886'
        to,
        body: 'WhatsApp test from Urban Cabz backend ✅',
      });
    }

    console.log('Message sent! SID:', message.sid);
    process.exit(0);
  } catch (err) {
    console.error('Twilio test error:');
    console.error(err);
    process.exit(1);
  }
}

sendTest();





