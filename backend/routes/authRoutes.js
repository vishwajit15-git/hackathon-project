const express = require('express');
const { body } = require('express-validator');
const { signup, login, getMe, updateLocation, adminCreateUser } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

router.post(
  '/signup',
  [
    body('name').notEmpty().trim().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('phone').optional().isMobilePhone('en-IN').withMessage('Invalid Indian phone number'),
  ],
  signup
);

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  login
);

router.get('/me', protect, getMe);
router.patch('/update-location', protect, updateLocation);
router.post('/admin/create-user', protect, requireRole('admin'), adminCreateUser);

module.exports = router;
