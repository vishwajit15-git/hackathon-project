const express = require('express');
const {
  getMyTasks,
  updateStatus,
  registerAsVolunteer,
  completeTask,
  getAllVolunteers,
  updateVolunteerLocation,
} = require('../controllers/volunteerController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

router.post('/register', protect, requireRole('admin'), registerAsVolunteer);
router.get('/tasks', protect, requireRole('volunteer'), getMyTasks);
router.patch('/status', protect, requireRole('volunteer'), updateStatus);
router.patch('/complete-task', protect, requireRole('volunteer'), completeTask);
router.patch('/location', protect, requireRole('volunteer'), updateVolunteerLocation);
router.get('/all', protect, requireRole('admin', 'police'), getAllVolunteers);

module.exports = router;
