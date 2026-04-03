const { generateBookingQR } = require('../utils/qrGenerator');
const logger = require('../utils/logger');
const admin = require('firebase-admin');

// Helper to generate IDs
const generateBookingId = () => `BK-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;

// POST /api/slots/create  (admin only)
const createSlot = async (req, res) => {
  try {
    const { date, startTime, endTime, zone, totalCapacity, specialSlot } = req.body;
    const targetDate = new Date(date).toISOString().split('T')[0];

    // Check for overlapping slot in same zone on same date
    const snapshot = await global.db.collection('slots')
      .where('dateStr', '==', targetDate)
      .where('zone', '==', zone.toUpperCase())
      .where('isActive', '==', true)
      .get();
      
    const hasOverlap = snapshot.docs.some(doc => {
      const data = doc.data();
      return (startTime < data.endTime) && (endTime > data.startTime);
    });

    if (hasOverlap) {
      return res.status(409).json({
        success: false,
        message: `A slot already exists for zone ${zone.toUpperCase()} during this time window.`,
      });
    }

    const slotData = {
      dateStr: targetDate, // easier query
      date: new Date(date),
      startTime,
      endTime,
      zone: zone.toUpperCase(),
      totalCapacity: parseInt(totalCapacity),
      bookedCount: 0,
      specialSlot: specialSlot || false,
      isActive: true,
      createdBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await global.db.collection('slots').add(slotData);

    logger.info(`Slot created: ${docRef.id} | Zone ${zone} | ${startTime}–${endTime}`);
    res.status(201).json({ success: true, message: 'Slot created successfully.', slot: { _id: docRef.id, ...slotData } });
  } catch (err) {
    logger.error(`createSlot error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// GET /api/slots  (public)
const getSlots = async (req, res) => {
  try {
    const { date, zone, specialOnly } = req.query;
    
    let query = global.db.collection('slots').where('isActive', '==', true);
    
    if (date) {
      const targetDate = new Date(date).toISOString().split('T')[0];
      query = query.where('dateStr', '==', targetDate);
    }
    if (zone) query = query.where('zone', '==', zone.toUpperCase());
    if (specialOnly === 'true') query = query.where('specialSlot', '==', true);

    const snapshot = await query.get();
    
    const slots = snapshot.docs.map(doc => ({ _id: doc.id, id: doc.id, ...doc.data() }));

    // Sort in memory to avoid "Missing Index" 500 errors
    slots.sort((a, b) => {
      if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
      return a.startTime.localeCompare(b.startTime);
    });

    res.status(200).json({
      success: true,
      count: slots.length,
      slots,
    });
  } catch (err) {
    logger.error(`getSlots error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// POST /api/slots/book  (authenticated user)
const bookSlot = async (req, res) => {
  try {
    const { slotId, groupSize = 1, isFamily = false, isSpecialNeeds = false } = req.body;
    
    const slotRef = global.db.collection('slots').doc(slotId);
    const bookingRef = global.db.collection('bookings').doc(); // Pre-allocate booking id
    const bookingIdCode = generateBookingId();
    
    let slotDataCache;

    // Run transaction
    await global.db.runTransaction(async (t) => {
      const doc = await t.get(slotRef);
      if (!doc.exists) throw new Error('SLOT_NOT_FOUND');
      
      const slotData = doc.data();
      if (!slotData.isActive) throw new Error('SLOT_NOT_FOUND');
      if (slotData.totalCapacity - slotData.bookedCount < groupSize) {
        throw new Error(`INSUFFICIENT_CAPACITY:${slotData.totalCapacity - slotData.bookedCount}`);
      }
      
      slotDataCache = { id: doc.id, _id: doc.id, ...slotData };

      // Increment slot usage safely
      t.update(slotRef, { bookedCount: admin.firestore.FieldValue.increment(groupSize) });

      // Create booking document inside transaction
      const bookingData = {
        bookingId: bookingIdCode,
        user: req.user.uid,
        slotId: slotId,
        slotData: {
          zone: slotData.zone,
          date: slotData.dateStr,
          startTime: slotData.startTime,
          endTime: slotData.endTime,
        },
        groupSize,
        isFamily,
        isSpecialNeeds,
        status: 'confirmed',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      t.set(bookingRef, bookingData);
    });

    // Generate QR code post-transaction to prevent retry side-effects
    const bookingObj = { bookingId: bookingIdCode, groupSize, isFamily, isSpecialNeeds, status: 'confirmed' };
    const { qrCode, qrData } = await generateBookingQR(bookingObj, slotDataCache, req.user);
    
    await bookingRef.update({ qrCode, qrData });

    logger.info(`Slot booked: ${bookingIdCode} | User: ${req.user.uid} | Slot: ${slotId}`);
    res.status(201).json({
      success: true,
      message: 'Slot booked successfully.',
      booking: {
        bookingId: bookingIdCode,
        slot: slotDataCache,
        groupSize,
        status: 'confirmed',
        qrCode,
      },
    });
  } catch (err) {
    if (err.message === 'SLOT_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Slot not found or inactive.' });
    }
    if (err.message.startsWith('INSUFFICIENT_CAPACITY')) {
      const avail = err.message.split(':')[1];
      return res.status(409).json({ success: false, message: `Insufficient capacity. Available: ${avail} seats.` });
    }
    logger.error(`bookSlot error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// GET /api/slots/my-bookings  (authenticated user)
const getMyBookings = async (req, res) => {
  try {
    const snapshot = await global.db.collection('bookings')
      .where('user', '==', req.user.uid)
      .get();

    const bookings = snapshot.docs.map(doc => ({ _id: doc.id, id: doc.id, ...doc.data() }));

    // Sort in memory
    bookings.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));

    // Reconstruct `slot` field to match legacy frontend API structure
    const formatted = bookings.map(b => {
      b.slot = b.slotData || { zone: 'Unknown', date: '', startTime: '', endTime: '' };
      return b;
    });

    res.status(200).json({ success: true, count: formatted.length, bookings: formatted });
  } catch (err) {
    logger.error(`getMyBookings error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// DELETE /api/slots/cancel/:bookingId  (authenticated user)
const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const snapshot = await global.db.collection('bookings')
      .where('bookingId', '==', bookingId)
      .where('user', '==', req.user.uid)
      .where('status', '==', 'confirmed')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const bookingDoc = snapshot.docs[0];
    const bookingData = bookingDoc.data();
    const slotId = bookingData.slotId;
    
    // Transaction to safely rollback capacity and cancel
    await global.db.runTransaction(async (t) => {
      const slotRef = global.db.collection('slots').doc(slotId);
      
      t.update(slotRef, { bookedCount: admin.firestore.FieldValue.increment(-bookingData.groupSize) });
      t.update(bookingDoc.ref, { 
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    logger.info(`Booking cancelled: ${bookingData.bookingId}`);
    res.status(200).json({ success: true, message: 'Booking cancelled successfully.' });
  } catch (err) {
    logger.error(`cancelBooking error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = { createSlot, getSlots, bookSlot, getMyBookings, cancelBooking };
