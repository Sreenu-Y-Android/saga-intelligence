const express = require('express');
const router = express.Router();
const {
    prepareAnalysisRecord,
    executeAnalysisWork,
    preparePostAnalysis,
    executePostAnalysisWork,
    getAllAnalyses,
    getLatestAnalysis,
    getAnalysisById,
    getAnalysisHistory,
    getPendingCount,
    getTopEngagers,
    autoQueueNewHandles,
    getDistinctAlertHandles
} = require('../services/engagerAnalysisService');
const { protect } = require('../middleware/authMiddleware');
const { requireAnyPageAccess } = require('../middleware/rbacMiddleware');

// Usable from both the Grievances and Alerts pages.
router.use(protect, requireAnyPageAccess(['/grievances', '/alerts']));

// @desc    Start (or resume) a Frequent Engagers analysis for a handle
// @route   POST /api/engager/engager-analysis
router.post('/engager-analysis', async (req, res) => {
    try {
        const { handle, period_days, source_id } = req.body;
        if (!handle) return res.status(400).json({ message: 'handle is required' });

        const result = await prepareAnalysisRecord(handle, Number(period_days) || 30, source_id || null);
        if (result.status === 'started') {
            // Fire and forget — frontend polls engager-analysis-all / latest for progress.
            executeAnalysisWork(result.analysisId, result.handle, Number(period_days) || 30);
        }
        res.status(result.status === 'invalid' ? 400 : 200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Start (or resume) a Frequent Engagers analysis scoped to a single
//          alert's post — fetches retweeters of that one tweet only, and
//          folds them into the same per-handle history used by full scans.
// @route   POST /api/engager/engager-analysis/post
router.post('/engager-analysis/post', async (req, res) => {
    try {
        const { alert_id } = req.body;
        if (!alert_id) return res.status(400).json({ message: 'alert_id is required' });

        const result = await preparePostAnalysis(alert_id);
        if (result.status === 'started') {
            executePostAnalysisWork(result.analysisId, result.handle, result.tweet);
        }
        const errorStatuses = { not_found: 404, unsupported_platform: 400, invalid: 400 };
        res.status(errorStatuses[result.status] || 200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Latest analysis per handle (for the Accounts tab)
// @route   GET /api/engager/engager-analysis-all
router.get('/engager-analysis-all', async (req, res) => {
    try {
        const analyses = await getAllAnalyses();
        res.status(200).json({ analyses });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Global engager ranking aggregated across all handles
// @route   GET /api/engager/engager-top
router.get('/engager-top', async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 50;
        const engagers = await getTopEngagers(limit);
        res.status(200).json({ engagers });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Latest analysis (with full engager list) for one handle
// @route   GET /api/engager/engager-analysis/latest?handle=...
router.get('/engager-analysis/latest', async (req, res) => {
    try {
        const { handle } = req.query;
        if (!handle) return res.status(400).json({ message: 'handle query param is required' });

        const analysis = await getLatestAnalysis(handle);
        if (!analysis) return res.status(404).json({ message: 'No analysis found for this handle' });

        res.status(200).json(analysis);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Past runs for one handle
// @route   GET /api/engager/engager-analysis/history?handle=...
router.get('/engager-analysis/history', async (req, res) => {
    try {
        const { handle } = req.query;
        if (!handle) return res.status(400).json({ message: 'handle query param is required' });
        const analyses = await getAnalysisHistory(handle, 20);
        res.status(200).json({ handle, analyses });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Count of analyses currently processing — drives frontend polling
// @route   GET /api/engager/engager-analysis-pending
router.get('/engager-analysis-pending', async (req, res) => {
    try {
        const count = await getPendingCount();
        res.status(200).json({ count });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Fetch a single analysis by id
// @route   GET /api/engager/engager-analysis/:id
router.get('/engager-analysis/:id', async (req, res) => {
    try {
        const analysis = await getAnalysisById(req.params.id);
        if (!analysis) return res.status(404).json({ message: 'Analysis not found' });
        res.status(200).json(analysis);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Kick off analysis for the next monitored handle due for re-analysis
// @route   POST /api/engager/engager-analysis-auto-queue
router.post('/engager-analysis-auto-queue', async (req, res) => {
    try {
        const result = await autoQueueNewHandles();
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Distinct X handles seen as an alert author (for bulk-adding on the Alerts page)
// @route   GET /api/engager/alert-handles
router.get('/alert-handles', async (req, res) => {
    try {
        const handles = await getDistinctAlertHandles();
        res.status(200).json({ handles });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
