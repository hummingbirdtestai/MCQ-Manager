// utils/twilioClient.js

const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error("❌ Twilio credentials are missing. Please check your .env file.");
  throw new Error("Twilio initialization failed");
}

const client = twilio(accountSid, authToken);

module.exports = { client };
