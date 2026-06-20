// File location: /api/verify-payment.js
// (create an "api" folder at your project ROOT if it doesn't exist yet —
//  same level as index.html, NOT inside any subfolder)
//
// This function:
// 1. Receives the Razorpay payment response from the browser after checkout
// 2. Verifies the cryptographic signature using your SECRET key (server-side only)
// 3. If valid, writes a "purchases" document to Firestore using the Admin SDK
//    (which bypasses security rules — this is the ONLY way purchases get created)
//
// Required environment variables (set these in Vercel dashboard, NOT in code):
//   RAZORPAY_KEY_SECRET       - your Razorpay secret key (NEVER commit this)
//   FIREBASE_SERVICE_ACCOUNT  - your Firebase service account JSON (see setup notes below)

const crypto = require('crypto');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK once (reused across function invocations)
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      firebaseUid,
      firebaseEmail,
      itemId,
      amount
    } = req.body;

    // Validate all required fields are present
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !firebaseUid || !itemId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ── STEP 1: Verify the payment signature ──
    // Razorpay signs order_id + payment_id with your secret key.
    // We recompute that signature ourselves and compare — if it matches,
    // the payment is genuinely confirmed by Razorpay, not faked by the browser.
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    const isValid = expectedSignature === razorpay_signature;

    if (!isValid) {
      console.error('Signature verification FAILED for payment:', razorpay_payment_id);
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // ── STEP 2: Signature is valid — record the purchase ──
    const purchaseId = `${firebaseUid}_${itemId}`;

    await db.collection('purchases').doc(purchaseId).set({
      userId: firebaseUid,
      userEmail: firebaseEmail || null,
      itemId: itemId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: amount || null,
      status: 'completed',
      purchasedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Purchase verified and recorded: ${purchaseId}`);

    return res.status(200).json({ success: true, purchaseId });

  } catch (err) {
    console.error('verify-payment error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};