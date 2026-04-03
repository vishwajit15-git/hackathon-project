const express = require('express');
const { createSlot, getSlots, bookSlot, getMyBookings, cancelBooking } = require('../controllers/slotController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

router.post('/', protect, requireRole('admin'), createSlot);
router.get('/', getSlots); // public — filter by date/zone/specialOnly query params
router.post('/book', protect, bookSlot);
router.get('/my-bookings', protect, getMyBookings);
router.delete('/cancel/:bookingId', protect, cancelBooking);

module.exports = router;
