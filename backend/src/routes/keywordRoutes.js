const express = require('express');
const router = express.Router();
const { getKeywords, createKeyword, deleteKeyword } = require('../controllers/keywordController');
const { protect } = require('../middleware/authMiddleware');
const { loadScope } = require('../middleware/scopeMiddleware');
const { requireAnyPageAccess } = require('../middleware/rbacMiddleware');

router.get('/', protect, loadScope, requireAnyPageAccess(['/settings', '/alerts']), getKeywords);
router.post('/', protect, loadScope, requireAnyPageAccess(['/settings']), createKeyword);
router.post('/scan', protect, loadScope, requireAnyPageAccess(['/settings']), require('../controllers/keywordController').triggerRescan);
router.delete('/:id', protect, loadScope, requireAnyPageAccess(['/settings']), deleteKeyword);

module.exports = router;
