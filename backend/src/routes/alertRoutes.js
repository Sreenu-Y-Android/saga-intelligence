const express = require('express');
const router = express.Router();
const {
    getAlerts,
    getAlertById,
    updateAlert,
    updateAlertSentiment,
    deleteAlert,
    getAlertStats,
    getAlertSummary,
    getDashboardStats,
    getUnreadCount,
    markAllAsRead,
    investigateLink,
    translateAlertContent,
    getSimilarEscalatedAlerts
} = require('../controllers/alertController');
const { protect } = require('../middleware/authMiddleware');
const { requireAnyPageAccess, requireFeatureAccess } = require('../middleware/rbacMiddleware');

const normalizeAlertStatus = (value) => {
    if (!value || typeof value !== 'string') return null;
    const normalized = value.toLowerCase();
    if (normalized === 'falsepositive' || normalized === 'false-positive') return 'false_positive';
    if (normalized === 'resolved') return 'acknowledged';
    return normalized;
};

const resolveAlertStatusFromQuery = (req) => (
    normalizeAlertStatus(req.query.status || req.query.status_filter || req.query.tab) || 'active'
);

const resolveAlertStatusFromBody = (req) => (
    normalizeAlertStatus(req.body.status || req.body.next_status)
);

router.use(protect, requireAnyPageAccess(['/alerts']));

router.get('/', requireFeatureAccess('/alerts', resolveAlertStatusFromQuery), getAlerts);
router.get('/stats', getAlertStats);
router.get('/summary', getAlertSummary);
router.get('/dashboard-stats', getDashboardStats);
router.get('/unread', requireFeatureAccess('/alerts', () => 'active'), getUnreadCount);
router.post('/investigate', requireFeatureAccess('/alerts', () => 'active'), (req, res, next) => {
    console.log('[AlertRoutes] POST /investigate reached');
    investigateLink(req, res, next);
});
router.post('/public-investigate', (req, res) => {
    console.log('[AlertRoutes] POST /public-investigate reached');
    investigateLink(req, res);
});
router.post('/translate', protect, translateAlertContent);
router.get('/debug', (req, res) => res.json({ version: '1.0.2', timestamp: new Date() }));
router.get('/:id', protect, getAlertById);
router.put('/read', protect, markAllAsRead);
router.put('/:id', protect, updateAlert);
router.post('/similar', protect, getSimilarEscalatedAlerts);
router.get('/:id', getAlertById);
router.put('/read', requireFeatureAccess('/alerts', () => 'active'), markAllAsRead);
router.put('/:id/sentiment', updateAlertSentiment);
router.delete('/:id', deleteAlert);
router.put('/:id', requireFeatureAccess('/alerts', resolveAlertStatusFromBody, { allowWhenMissing: true }), updateAlert);

module.exports = router;
