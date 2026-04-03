const { validationResult } = require('express-validator');
const logger = require('../utils/logger');
const axios = require('axios');

// Using Firebase REST API to generate real client ID Tokens without frontend changes
const getFirebaseIdToken = async (email, password) => {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) throw new Error('FIREBASE_API_KEY is required in .env for backend login simulation.');

  const response = await axios.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    { email, password, returnSecureToken: true }
  );
  return response.data; // { idToken, localId, ... }
};

// POST /api/auth/signup
const signup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, phone, role } = req.body;
    
    // PER USER REQUEST: Admin and User can register independently.
    // Personnel roles (Volunteer, Police, Medical) must be created by an Admin.
    const assignedRole = ['admin', 'user'].includes(role) ? role : 'user';

    // 1. Create user in Firebase Auth
    const userRecord = await global.adminAuth.createUser({
      email,
      password,
      displayName: name,
      phoneNumber: phone ? (phone.startsWith('+') ? phone : `+91${phone}`) : undefined,
    });

    // 2. Save structured profile in Firestore
    const userDoc = {
      name,
      email,
      phone,
      role: assignedRole,
      isActive: true,
      lastSeen: new Date(),
      createdAt: new Date(),
    };
    await global.db.collection('users').doc(userRecord.uid).set(userDoc);

    // 3. Generate token via REST API so frontend doesn't break
    let token;
    try {
      const authData = await getFirebaseIdToken(email, password);
      token = authData.idToken;
    } catch (tokenErr) {
      logger.warn(`Could not generate ID token (ensure FIREBASE_API_KEY is set): ${tokenErr.message}`);
      // Fallback: return custom token (requires frontend changes to consume)
      token = await global.adminAuth.createCustomToken(userRecord.uid);
    }

    logger.info(`New user registered in Firebase: ${email} [${assignedRole}]`);
    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      token,
      user: { ...userDoc, _id: userRecord.uid, uid: userRecord.uid },
    });
  } catch (err) {
    logger.error(`signup error: ${err.message}`);
    if (err.code === 'auth/email-already-exists') {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }
    if (err.code === 'auth/phone-number-already-exists') {
      return res.status(409).json({ success: false, message: 'Phone number already registered.' });
    }
    res.status(500).json({ success: false, message: `Internal server error: ${err.message}` });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    let authData;
    try {
      authData = await getFirebaseIdToken(email, password);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const uid = authData.localId;
    const userRef = global.db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(401).json({ success: false, message: 'User profile missing in DB.' });
    }

    const userData = userDoc.data();
    if (!userData.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact admin.' });
    }

    await userRef.update({ lastSeen: new Date() });

    logger.info(`User logged in via Firebase: ${email} [${userData.role}]`);
    res.status(200).json({
      success: true,
      message: 'Login successful.',
      token: authData.idToken,
      user: { ...userData, _id: uid, uid },
    });
  } catch (err) {
    logger.error(`login error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    res.status(200).json({ success: true, user: req.user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// PATCH /api/auth/update-location
const updateLocation = async (req, res) => {
  try {
    const { longitude, latitude, zone } = req.body;

    // Firestore stores GeoPoints natively
    const admin = require('firebase-admin');
    const location = new admin.firestore.GeoPoint(latitude, longitude);

    await global.db.collection('users').doc(req.user.uid).update({
      location,
      currentZone: zone?.toUpperCase() || null,
      lastSeen: new Date()
    });

    res.status(200).json({ success: true, message: 'Location updated.' });
  } catch (err) {
    logger.error(`updateLocation error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// POST /api/auth/admin/create-user (admin only)
const adminCreateUser = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    if (!['volunteer', 'police', 'admin', 'user'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role specified.' });
    }

    // 1. Create user in Firebase Auth
    const userRecord = await global.adminAuth.createUser({
      email,
      password,
      displayName: name,
      phoneNumber: phone ? (phone.startsWith('+') ? phone : `+91${phone}`) : undefined,
    });

    // 2. Save structured profile in Firestore
    const userDoc = {
      name,
      email,
      phone,
      role,
      isActive: true,
      lastSeen: new Date(),
      createdAt: new Date(),
      createdBy: req.user.uid,
    };
    await global.db.collection('users').doc(userRecord.uid).set(userDoc);

    logger.info(`Admin ${req.user.uid} created a new ${role}: ${email}`);
    res.status(201).json({
      success: true,
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully.`,
      user: { ...userDoc, _id: userRecord.uid, uid: userRecord.uid },
    });
  } catch (err) {
    logger.error(`adminCreateUser error: ${err.message}`);
    if (err.code === 'auth/email-already-exists') {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = { signup, login, getMe, updateLocation, adminCreateUser };
