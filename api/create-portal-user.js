// api/create-portal-user.js
//
// Vercel serverless function. Creates a real Firebase Auth account for an
// approved Parent or Student registration, using the Firebase Admin SDK
// (this can only be done server-side — the client SDK would sign the
// current admin out and into the new account, which we don't want).
//
// SETUP REQUIRED (one-time):
// 1. Firebase Console → Project Settings → Service Accounts →
//    "Generate new private key" — downloads a JSON file.
// 2. Vercel → Project → Settings → Environment Variables → add
//    FIREBASE_SERVICE_ACCOUNT_JSON = the full contents of that JSON file.
// 3. Add "firebase-admin" to package.json dependencies.
//
// SECURITY: this endpoint checks that the caller is signed in as an admin
// (their Firebase ID token's email must be in ADMIN_EMAILS below) before
// creating anything. Keep ADMIN_EMAILS in sync with window.ADMIN_EMAILS
// in index.html.

const admin = require("firebase-admin");

const ADMIN_EMAILS = ["abhishekbasu188@gmail.com"];

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const PORTAL_DOMAIN = "portal.studyhub.internal"; // synthetic email domain, never shown to users

function randomId(prefix) {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${n}`;
}

function randomPassword(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // 1. Verify the caller is an authenticated admin
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.replace("Bearer ", "");
    if (!idToken) {
      res.status(401).json({ error: "Missing auth token" });
      return;
    }
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (!ADMIN_EMAILS.includes(decoded.email)) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    // 2. Validate input
    const { type, requestId, profile } = req.body || {};
    if (!["parent", "student"].includes(type) || !requestId || !profile) {
      res.status(400).json({ error: "Missing or invalid fields (type, requestId, profile)" });
      return;
    }

    // 3. Generate a portal ID + password
    const prefix = type === "parent" ? "PAR" : "STU";
    const portalId = randomId(prefix);
    const password = randomPassword();
    const syntheticEmail = `${portalId.toLowerCase()}@${PORTAL_DOMAIN}`;

    // 4. Create the Firebase Auth account
    const userRecord = await admin.auth().createUser({
      email: syntheticEmail,
      password,
      displayName: profile.name || portalId,
      disabled: false,
    });
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: type, portalId });

    // 5. Write the profile document
    const db = admin.firestore();
    const collection = type === "parent" ? "parents" : "students";
    const docData = {
      ...profile,
      [`${type}Id`]: portalId,
      portalId,
      authUid: userRecord.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection(collection).doc(portalId).set(docData);

    // 6. Mark the registration request as approved
    await db.collection("registrationRequests").doc(requestId).update({
      status: "approved",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      issuedId: portalId,
    });

    res.status(200).json({ portalId, password });
  } catch (err) {
    console.error("create-portal-user error:", err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
};