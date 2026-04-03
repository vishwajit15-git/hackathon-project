const axios = require('axios');
const { autoAssignVolunteer } = require('../services/assignmentService');
const { emitPersonFound } = require('../services/socketService');
const { notifyRoles, notifyUser } = require('../services/notificationService');
const logger = require('../utils/logger');
const admin = require('firebase-admin');

// Helper to generate a sequential case ID logic
const generateCaseId = () => `MP-${Math.floor(Math.random() * 1000000)}`;

// POST /api/missing/report  (authenticated user)
const reportMissing = async (req, res) => {
  try {
    const { name, age, gender, photoUrl, description, lastSeenZone, lastSeenTime, distinctiveFeatures } = req.body;

    const caseId = generateCaseId();

    const missingCaseData = {
      caseId,
      reporter: {
        uid: req.user.uid,
        name: req.user.name,
        phone: req.user.phone,
      },
      name,
      age: parseInt(age) || null,
      gender,
      photoUrl: photoUrl || null,
      description,
      lastSeenZone: lastSeenZone?.toUpperCase() || null,
      lastSeenTime: lastSeenTime ? new Date(lastSeenTime) : null,
      distinctiveFeatures: distinctiveFeatures || null,
      status: 'reported',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await global.db.collection('missing_persons').add(missingCaseData);

    // Auto-assign a volunteer in the last seen zone to search
    if (lastSeenZone) {
      await autoAssignVolunteer(
        lastSeenZone,
        'missing_person',
        docRef.id,
        'MissingPerson'
      );
    }

    // Notify admin and police
    notifyRoles(['admin', 'police', 'volunteer'], 'missing:new', {
      caseId,
      name,
      lastSeenZone: lastSeenZone?.toUpperCase(),
      reportedBy: req.user.name,
    });

    logger.info(`Missing person reported: ${caseId} | ${name}`);
    res.status(201).json({
      success: true,
      message: 'Missing person reported. Volunteers have been notified.',
      case: { _id: docRef.id, ...missingCaseData },
    });
  } catch (err) {
    logger.error(`reportMissing error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// GET /api/missing/status/:caseId  (authenticated)
const getMissingStatus = async (req, res) => {
  try {
    const snapshot = await global.db.collection('missing_persons')
      .where('caseId', '==', req.params.caseId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ success: false, message: 'Case not found.' });
    }

    const doc = snapshot.docs[0];
    res.status(200).json({ success: true, case: { _id: doc.id, id: doc.id, ...doc.data() } });
  } catch (err) {
    logger.error(`getMissingStatus error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// POST /api/missing/search  (admin)
const searchMissing = async (req, res) => {
  try {
    const { caseId } = req.body;

    const snapshot = await global.db.collection('missing_persons')
      .where('caseId', '==', caseId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ success: false, message: 'Case not found.' });
    }

    const docRef = snapshot.docs[0].ref;
    const missingCase = snapshot.docs[0].data();

    await docRef.update({ status: 'searching' });

    let mlResult;
    try {
      const { data } = await axios.post(
        `${process.env.ML_SERVICE_URL}/find-missing`,
        { caseId, photoUrl: missingCase.photoUrl, lastSeenZone: missingCase.lastSeenZone },
        { timeout: 3000 }
      );
      mlResult = data;
    } catch {
      mlResult = {
        found: false,
        confidence: 0,
        note: 'ML face-match service unavailable. Returning mock response.',
        mock: true,
      };
    }

    if (mlResult.found && mlResult.confidence > 0.7) {
      const matchedZone = mlResult.zone?.toUpperCase();
      
      await docRef.update({
        status: 'found',
        matchScore: mlResult.confidence,
        matchedAt: admin.firestore.FieldValue.serverTimestamp(),
        matchedZone,
      });

      emitPersonFound(caseId, {
        name: missingCase.name,
        zone: matchedZone,
        confidence: mlResult.confidence,
      });

      notifyUser(missingCase.reporter.uid, 'missing:found', {
        caseId,
        name: missingCase.name,
        message: `Great news! ${missingCase.name} has been found in Zone ${matchedZone}`,
      });

      logger.info(`Missing person found: ${caseId} | Confidence: ${mlResult.confidence}`);
    }

    res.status(200).json({
      success: true,
      caseId,
      status: mlResult.found ? 'found' : 'searching',
      mlResult,
    });
  } catch (err) {
    logger.error(`searchMissing error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// GET /api/missing/all  (admin, police)
const getAllMissingCases = async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    
    let query = global.db.collection('missing_persons');
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    // Pagination requires cursor implementation in frontend, capping to limit
    const snapshot = await query.limit(parseInt(limit)).get();

    const cases = snapshot.docs.map(doc => ({ _id: doc.id, id: doc.id, ...doc.data() }));
    
    // Sort in memory to avoid missing index errors
    cases.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
    
    res.status(200).json({ success: true, count: cases.length, cases });
  } catch (err) {
    logger.error(`getAllMissingCases error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

const updateMissingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['reported', 'searching', 'found', 'resolved'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    
    const docRef = global.db.collection('missing_persons').doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Case not found.' });
    }

    const { foundLocation, foundBy } = req.body;
    const updateData = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    };

    // If found, handle the GeoPoint and Volunteer tracking
    if (status === 'found') {
      if (foundLocation && foundLocation.coordinates) {
        updateData.matchedZone = req.body.zone || doc.data().lastSeenZone;
        updateData.matchedAt = admin.firestore.FieldValue.serverTimestamp();
        // Convert to Firestore GeoPoint
        updateData.foundLocation = new admin.firestore.GeoPoint(
          foundLocation.coordinates[1], // Latitude
          foundLocation.coordinates[0]  // Longitude
        );
      }
      if (foundBy) updateData.foundBy = foundBy;
    }
    
    await docRef.update(updateData);
    
    logger.info(`Missing case status updated: ${id} to ${status}`);
    res.status(200).json({ success: true, message: `Status updated to ${status}.` });
  } catch (err) {
    logger.error(`updateMissingStatus error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = { reportMissing, getMissingStatus, searchMissing, getAllMissingCases, updateMissingStatus };
