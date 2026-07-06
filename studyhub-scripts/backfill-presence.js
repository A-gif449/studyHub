const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function backfillPresence() {
  let nextPageToken;
  let totalUpdated = 0;

  do {
    const result = await admin.auth().listUsers(1000, nextPageToken);

    for (const userRecord of result.users) {
      const lastSignIn = userRecord.metadata.lastSignInTime;
      const created    = userRecord.metadata.creationTime;
      const lastActiveDate = lastSignIn ? new Date(lastSignIn) : new Date(created);

      await db.collection('presence').doc(userRecord.uid).set({
        lastActive: admin.firestore.Timestamp.fromDate(lastActiveDate),
        online: false
      }, { merge: true });

      totalUpdated++;
      console.log(`✅ ${userRecord.email || userRecord.uid} → ${lastActiveDate.toISOString()}`);
    }

    nextPageToken = result.pageToken;
  } while (nextPageToken);

  console.log(`\nDone. Backfilled presence for ${totalUpdated} users.`);
  process.exit(0);
}

backfillPresence().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});