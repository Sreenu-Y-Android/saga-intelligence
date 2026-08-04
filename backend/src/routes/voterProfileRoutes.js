const express = require('express');
const router = express.Router();
const { listVoterProfiles, getVoterProfile, getBoothLevelData, getBoothVoters, getBoothSentiment } = require('../controllers/voterProfileController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, listVoterProfiles);
router.get('/:constituency/booths/:part/voters', protect, getBoothVoters);
router.get('/:constituency/booths/:part/sentiment', protect, getBoothSentiment);
router.get('/:constituency/booths', protect, getBoothLevelData);
router.get('/:constituency', protect, getVoterProfile);

module.exports = router;
