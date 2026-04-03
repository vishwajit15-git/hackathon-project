const { initFirebase, admin } = require('./config/firebaseAdmin');
require('dotenv').config();

const { db } = initFirebase();

async function cleanupAndAdd() {
  try {
    const snapshot = await db.collection('missing_persons').get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`Deleted ${snapshot.size} missing person records.`);

    // Add a new missing person without a photo
    const newCase = {
      caseId: `MP-${Math.floor(Math.random() * 1000000)}`,
      name: 'Test Person (No Photo)',
      age: 25,
      gender: 'male',
      description: 'New test entry with no image to check search robustness.',
      lastSeenZone: 'ZONE_A',
      status: 'reported',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      photoUrl: null, // Explicitly no photo
      reporter: {
        name: 'System Admin',
        uid: 'system_admin_manual'
      }
    };

    await db.collection('missing_persons').add(newCase);
    console.log(`Created new missing person: ${newCase.name} (Case ID: ${newCase.caseId})`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

cleanupAndAdd();
