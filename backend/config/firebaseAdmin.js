const admin = require('firebase-admin');
const logger = require('../utils/logger');

// Initialize Firebase Admin SDK
// You MUST place a serviceAccountKey.json at the root of the backend
// OR populate FIREBASE_SERVICE_ACCOUNT base64 string in your .env
const initFirebase = () => {
  try {
    let credential;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('ascii')
      );
      credential = admin.credential.cert(serviceAccount);
    } else {
      // Fallback to local file for dev
      const serviceAccount = require('../serviceAccountKey.json');
      credential = admin.credential.cert(serviceAccount);
    }

    admin.initializeApp({
      credential,
    });

    const db = admin.firestore();
    const auth = admin.auth();

    logger.info('🔥 Firebase Admin SDK initialized successfully.');

    return { db, auth };
  } catch (error) {
    logger.error(`❌ Firebase initialization failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = { initFirebase, admin };
