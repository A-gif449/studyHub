// File location: /api/create-order.js
// (same "api" folder as verify-payment.js, at project root)
//
// Why this needs to be a server function too:
// Creating a Razorpay order requires your SECRET key (not just the public
// Key ID). If we created the order directly from the browser, we'd have
// to expose the secret key in client JS — which anyone could steal and
// use to create fraudulent orders under your account. So order creation
// happens here, server-side, using the secret key from environment variables.
//
// Required environment variables (same Vercel project as verify-payment.js):
//   RAZORPAY_KEY_ID      - your Razorpay public key (rzp_live_... or rzp_test_...)
//   RAZORPAY_KEY_SECRET  - your Razorpay secret key

const Razorpay = require('razorpay');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, itemId, firebaseUid } = req.body;

    if (!amount || !itemId || !firebaseUid) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    // amount must be in paise (smallest currency unit) — e.g. ₹199 = 19900
    const order = await instance.orders.create({
      amount: amount,
      currency: 'INR',
      receipt: `iq_${itemId}_${firebaseUid.slice(0, 8)}_${Date.now()}`,
      notes: {
        itemId: itemId,
        firebaseUid: firebaseUid
      }
    });

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });

  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: 'Could not create order', details: err.message });
  }
};