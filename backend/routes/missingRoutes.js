const express = require('express');
const { reportMissing, getMissingStatus, searchMissing, getAllMissingCases, updateMissingStatus } = require('../controllers/missingController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

router.post('/report', protect, reportMissing);
router.get('/status/:caseId', protect, getMissingStatus);
router.post('/search', protect, requireRole('admin', 'police'), searchMissing);
router.get('/all', protect, requireRole('admin', 'police'), getAllMissingCases);
router.patch('/:id/status', protect, requireRole('admin', 'police'), updateMissingStatus);

module.exports = router;
