const Razorpay = require('razorpay');

let razorpay;
try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  } else {
    console.warn("⚠️ Razorpay credentials missing. Payment features will fail.");
  }
} catch (err) {
  console.error("Razorpay init error:", err.message);
}

async function createOrder({ amount, currency = 'INR', receipt }) {
  if (!razorpay) {
    throw new Error("Razorpay not initialized. Check server keys.");
  }
  return razorpay.orders.create({
    amount: Math.round(amount * 100), // rupees → paise
    currency,
    receipt
  });
}

module.exports = { createOrder };