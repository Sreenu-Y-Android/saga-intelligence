const express = require('express');
const router = express.Router();
const {
  getLeaderboard,
  getSummary,
  getConstituencyDetail,
  getConstituencyNarrative,
  getComparison,
} = require('../controllers/constituencyIntelligenceController');
const { protect } = require('../middleware/authMiddleware');

// Constituency War Room — party-strategist intelligence across AP seats.
router.get('/leaderboard', protect, getLeaderboard);
router.get('/summary', protect, getSummary);
router.get('/compare', protect, getComparison);
router.get('/:constituency/narrative', protect, getConstituencyNarrative);
router.get('/:constituency', protect, getConstituencyDetail);

module.exports = router;
