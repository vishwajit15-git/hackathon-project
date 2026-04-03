const { releaseVolunteer } = require('../services/assignmentService');
const logger = require('../utils/logger');
const admin = require('firebase-admin');

// GET /api/volunteer/tasks  (volunteer)
const getMyTasks = async (req, res) => {
  try {
    const doc = await global.db.collection('volunteers').doc(req.user.uid).get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Volunteer profile not found.' });
    }
    
    const volunteerData = doc.data();
    
    // In Firebase, we must manually fetch the referenced task since populate() is unavailable natively.
    if (volunteerData.taskRefModel && volunteerData.taskReference) {
      const taskDoc = await global.db.collection(volunteerData.taskRefModel).doc(volunteerData.taskReference).get();
      volunteerData.taskData = taskDoc.exists ? taskDoc.data() : null;
    }

    res.status(200).json({ success: true, volunteer: { _id: doc.id, id: doc.id, ...volunteerData } });
  } catch (err) {
    logger.error(`getMyTasks error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// PATCH /api/volunteer/status  (volunteer)
const updateStatus = async (req, res) => {
  try {
    const { status, zone } = req.body;

    if (!['available', 'busy', 'offline'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const docRef = global.db.collection('volunteers').doc(req.user.uid);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Volunteer profile not found.' });
    }

    const update = { status };
    if (zone) update.zone = zone.toUpperCase();
    if (status === 'available') {
      update.currentTask = 'none';
      update.taskReference = null;
      update.taskRefModel = null;
      update.taskAssignedAt = null;
    }

    await docRef.update(update);

    logger.info(`Volunteer ${req.user.uid} status changed to: ${status}`);
    res.status(200).json({ success: true, message: 'Status updated.', volunteer: { _id: doc.id, ...doc.data(), ...update } });
  } catch (err) {
    logger.error(`updateStatus error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// POST /api/volunteer/register  (admin only)
const registerAsVolunteer = async (req, res) => {
  try {
    const { uid, zone, longitude, latitude } = req.body;

    if (!uid) {
      return res.status(400).json({ success: false, message: 'User ID (uid) is required for registration.' });
    }

    // Verify target user exists and has the 'volunteer' role
    const userDoc = await global.db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'User not found in DB.' });
    }

    const userData = userDoc.data();
    if (userData.role !== 'volunteer') {
      return res.status(400).json({ success: false, message: 'Target user does not have the "volunteer" role in their profile.' });
    }

    const docRef = global.db.collection('volunteers').doc(uid);
    const existing = await docRef.get();
    
    if (existing.exists) {
      return res.status(409).json({ success: false, message: 'User is already registered as an active volunteer.' });
    }

    const volunteerData = {
      user: {
        uid: uid,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
      },
      zone: zone?.toUpperCase(),
      location: new admin.firestore.GeoPoint(latitude || 0, longitude || 0),
      status: 'offline',
      currentTask: 'none',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await docRef.set(volunteerData);

    logger.info(`Volunteer officially registered by ${req.user.uid}: ${uid} in zone ${zone}`);
    res.status(201).json({ success: true, message: 'Volunteer officially registered.', volunteer: { _id: docRef.id, ...volunteerData } });
  } catch (err) {
    logger.error(`registerAsVolunteer error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// PATCH /api/volunteer/complete-task  (volunteer)
const completeTask = async (req, res) => {
  try {
    const docRef = global.db.collection('volunteers').doc(req.user.uid);
    const doc = await docRef.get();
    
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Volunteer not found.' });

    await releaseVolunteer(req.user.uid);

    res.status(200).json({ success: true, message: 'Task marked as complete. You are now available.' });
  } catch (err) {
    logger.error(`completeTask error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// GET /api/volunteer/all  (admin/police)
const getAllVolunteers = async (req, res) => {
  try {
    const { status, zone, limit = 100 } = req.query;
    
    let query = global.db.collection('volunteers');
    
    if (status) query = query.where('status', '==', status);
    if (zone) query = query.where('zone', '==', zone.toUpperCase());

    const snapshot = await query.get();
    
    let volunteers = snapshot.docs.map(doc => ({ 
      _id: doc.id, 
      id: doc.id, 
      ...doc.data() 
    }));

    // Sort in-memory to avoid index requirements
    volunteers.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));

    // Apply limit after sorting
    volunteers = volunteers.slice(0, parseInt(limit));

    res.status(200).json({ success: true, count: volunteers.length, volunteers });
  } catch (err) {
    logger.error(`getAllVolunteers error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// PATCH /api/volunteer/location  (volunteer)
const updateVolunteerLocation = async (req, res) => {
  try {
    const { longitude, latitude, zone } = req.body;
    
    const docRef = global.db.collection('volunteers').doc(req.user.uid);
    const doc = await docRef.get();
    
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Volunteer not found.' });

    const update = {
      location: new admin.firestore.GeoPoint(latitude, longitude),
    };
    if (zone) update.zone = zone.toUpperCase();

    await docRef.update(update);

    res.status(200).json({ success: true, message: 'Volunteer location updated.' });
  } catch (err) {
    logger.error(`updateVolunteerLocation error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = {
  getMyTasks,
  updateStatus,
  registerAsVolunteer,
  completeTask,
  getAllVolunteers,
  updateVolunteerLocation,
};
