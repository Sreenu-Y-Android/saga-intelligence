const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { computeAllScores, getConstituencyDetail, getDailyTrend } = require('../services/unrestPredictorService');

const clampWindow = (val) => {
  const n = parseInt(val, 10);
  if (!n || n < 1) return 7;
  return Math.min(n, 90);
};

// GET /api/unrest/overview?window=7
router.get('/overview', protect, async (req, res) => {
  try {
    const window = clampWindow(req.query.window || 7);
    const data = await computeAllScores(window);
    res.json(data);
  } catch (err) {
    console.error('[UnrestRoutes] overview error:', err.message);
    res.status(500).json({ error: 'Failed to compute unrest overview' });
  }
});

// GET /api/unrest/constituency/:name?window=7
router.get('/constituency/:name', protect, async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Constituency name required' });
    const window = clampWindow(req.query.window || 7);
    const data = await getConstituencyDetail(name, window);
    if (!data) return res.status(404).json({ error: 'No grievance data found for this constituency in the selected window' });
    res.json(data);
  } catch (err) {
    console.error('[UnrestRoutes] constituency detail error:', err.message);
    res.status(500).json({ error: 'Failed to compute constituency detail' });
  }
});

// GET /api/unrest/trend?constituency=Guntur+West&days=30
router.get('/trend', protect, async (req, res) => {
  try {
    const name = (req.query.constituency || '').trim();
    if (!name) return res.status(400).json({ error: 'constituency query param required' });
    const days = Math.min(parseInt(req.query.days, 10) || 30, 90);
    const data = await getDailyTrend(name, days);
    res.json({ constituency: name, days, data });
  } catch (err) {
    console.error('[UnrestRoutes] trend error:', err.message);
    res.status(500).json({ error: 'Failed to fetch trend data' });
  }
});

module.exports = router;
