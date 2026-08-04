require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const connectDB = require('./config/db');
const { startMonitoring } = require('./services/monitorService');
const { startTempContentProcessor } = require('./services/tempContentProcessor');
const { seedDefaultThresholds } = require('./services/velocityAlertService');
const grievanceService = require('./services/grievanceService');
const User = require('./models/User');
const Settings = require('./models/Settings');
const Source = require('./models/Source');
const Content = require('./models/Content');
const Report = require('./models/Report');
const GrievanceSource = require('./models/GrievanceSource');
const SearchHistory = require('./models/SearchHistory');
const { google } = require('googleapis');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { seedRecurringEvents } = require('./controllers/masterCalendarController');
const { syncCalendarToEvents } = require('./services/calendarEventSyncService');
const fs = require('fs');

const app = express();

// Trust proxy for proper protocol detection behind nginx/load balancer
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()) : '*',
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'x-requested-with']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/deepfake', require('./routes/deepfakeRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/sources', require('./routes/sourceRoutes'));
app.use('/api/content', require('./routes/contentRoutes'));
app.use('/api/alerts', require('./routes/alertRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/intelligence', require('./routes/intelligenceDashboardRoutes'));
app.use('/api/keywords', require('./routes/keywordRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));
app.use('/api/youtube', require('./routes/youtube.routes'));
app.use('/api/x', require('./routes/x.routes'));
app.use('/api/engager', require('./routes/engagerRoutes'));
app.use('/api/media', require('./routes/media.routes'));
app.use('/api/search', require('./routes/searchRoutes'));
app.use('/api/events', require('./routes/eventRoutes'));
app.use('/api/alert-thresholds', require('./routes/alertThresholdRoutes'));

app.use('/api/grievances', require('./routes/grievanceRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/ongoing-events', require('./routes/ongoingEventRoutes'));
app.use('/api/daily-programmes', require('./routes/dailyProgrammeRoutes'));
app.use('/api/export', require('./routes/exportRoutes'));
app.use('/api/uploads', require('./routes/uploadRoutes'));
app.use('/api/instagram-stories', require('./routes/instagramStoryRoutes'));
app.use('/api/dial100-incidents', require('./routes/dial100IncidentRoutes'));
app.use('/api/criticism', require('./routes/criticismRoutes'));
app.use('/api/grievance-workflow', require('./routes/grievanceWorkflowRoutes'));
app.use('/api/query-workflow', require('./routes/queryRoutes'));
app.use('/api/suggestion', require('./routes/suggestionRoutes'));
app.use('/api/suggestions', require('./routes/suggestionRoutes'));
app.use('/api/policies', require('./routes/policyRoutes'));
app.use('/api/templates', require('./routes/templatesRoutes'));
app.use('/api/poi', require('./routes/poiRoutes'));
app.use('/api/telegram', require('./routes/telegramRoutes'));
app.use('/api/master-calendar', require('./routes/masterCalendarRoutes'));
app.use('/api/media-transcribe', require('./routes/transcribeRoutes'));

// ── Intelligence & geographic modules ──────────────────────────────
app.use('/api/admin', require('./routes/profileSettingsRoutes'));
app.use('/api/unrest', require('./routes/unrest.routes'));
app.use('/api/news', require('./routes/newsRoutes'));
app.use('/api/intelligence-reports', require('./routes/intelligenceReportRoutes'));
app.use('/api/search-trends', require('./routes/searchTrends'));
app.use('/api/constituency-intel', require('./routes/constituencyIntelligenceRoutes'));
app.use('/api/geo-intel', require('./routes/geoIntelRoutes'));
app.use('/api/dashboard', require('./routes/apDashboardRoutes'));
app.use('/api/voter-profiles', require('./routes/voterProfileRoutes'));
app.use('/api/web-articles', require('./routes/webArticleRoutes'));

// Proxy for the Python location-extraction service, so the browser talks to
// one origin and we avoid a mixed-content block behind HTTPS.
app.post('/api/location-extraction/:path*', async (req, res) => {
  try {
    const locationServiceBaseUrl = String(process.env.LOCATION_SERVICE_URL || 'http://localhost:5002')
      .trim()
      .replace(/\/+$/, '');
    const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const targetUrl = `${locationServiceBaseUrl}/api/${req.params.path}${query}`;
    const response = await axios({
      method: 'post',
      url: targetUrl,
      data: req.body,
      headers: { 'Content-Type': 'application/json' },
    });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
});

app.get('/api/verify-v2', (req, res) => res.json({ status: 'ok', version: 'v2-diagnostic', timestamp: new Date() }));
app.get('/api/ping', (req, res) => res.json({ status: 'ok', msg: 'Deepfake integration check' }));
app.use('/api/rbac', require('./routes/rbacRoutes'));
//app.get('/api/ping', (req, res) => res.json({ status: 'ok', msg: 'Deepfake integration check' }));

// Catch-all 404 handler for debugging untracked routes
app.use((req, res, next) => {
  console.log(`[404] Path NOT FOUND: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: `Path ${req.originalUrl} not found` });
});

// Default Admin User
const createDefaultAdmin = async () => {
  try {
    const adminEmail = 'admin@blurahub.com';
    const adminExists = await User.findOne({ email: adminEmail });

    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);

      await User.create({
        email: adminEmail,
        password: hashedPassword,
        full_name: 'System Administrator',
        role: 'superadmin'
      });
      //console.log('Default admin user created: admin@blurahub.com / admin123');
    }
  } catch (error) {
    //console.error(`Error creating default admin: ${error.message}`);
  }
};

// Default Settings
const createDefaultSettings = async () => {
  try {
    const settings = await Settings.findOne({ id: 'global_settings' });
    if (!settings) {
      await Settings.create({
        id: 'global_settings',
        high_risk_threshold: 70,
        medium_risk_threshold: 40,
        risk_threshold_high: 70,
        risk_threshold_medium: 40,
        monitoring_interval_minutes: 5,
        enable_email_alerts: true
      });
      //console.log('Default settings created');
    }
  } catch (error) {
    //console.error(`Error creating default settings: ${error.message}`);
  }
};

const seedSources = async () => {
  try {
    const sourcesList = require('./data/sources_list.json');
    const apiKey = process.env.YOUTUBE_API_KEY;
    const youtube = apiKey ? google.youtube({ version: 'v3', auth: apiKey }) : null;

    //console.log(`Seeding ${sourcesList.length} sources...`);

    for (const source of sourcesList) {
      // Check if exists by identifier or display name
      const existing = await Source.findOne({
        $or: [
          { identifier: source.identifier },
          { display_name: source.display_name, platform: source.platform }
        ]
      });

      if (existing) continue;

      let identifier = source.identifier;

      // Resolve YouTube handle/name to Channel ID if needed
      if (source.platform === 'youtube' && !identifier.startsWith('UC') && youtube) {
        try {
          const response = await youtube.search.list({
            part: 'snippet',
            q: identifier,
            type: 'channel',
            maxResults: 1
          });

          if (response.data.items && response.data.items.length > 0) {
            identifier = response.data.items[0].id.channelId;
            // Also try to get stats here if possible, to avoid 0s
            // But doing it for all might hit quota.
            // We will rely on user Sync for seeded data to save quota.
            //console.log(`Resolved ${source.identifier} to ${identifier}`);
          } else {
            //console.warn(`Could not resolve YouTube handle: ${source.identifier}`);
          }
        } catch (err) {
          //console.error(`Error resolving ${source.identifier}: ${err.message}`);
        }
      }

      try {
        await Source.create({
          platform: source.platform,
          identifier: identifier,
          display_name: source.display_name,
          category: source.category,
          created_by: 'system_seed',
          is_active: true
        });
        //console.log(`Seeded source: ${source.display_name} (${source.platform})`);
      } catch (err) {
        if (err.code !== 11000) { // Ignore duplicate key errors
          //console.error(`Failed to seed ${source.display_name}: ${err.message}`);
        }
      }
    }
    //console.log('Seeding completed.');
  } catch (error) {
    //console.error('Error seeding sources:', error);
  }
};

const fixIndexes = async () => {
  try {
    const indexes = await Content.collection.indexes();
    const keyIndex = indexes.find(idx => idx.name === 'key_1');
    if (keyIndex) {
      //console.log('Dropping invalid index key_1 from contents collection...');
      await Content.collection.dropIndex('key_1');
      //console.log('Index dropped.');
    }

    const legacyContentIdIndex = indexes.find(idx => idx.name === 'content_id_1');
    if (legacyContentIdIndex) {
      //console.log('Dropping legacy unique index content_id_1 from contents collection...');
      await Content.collection.dropIndex('content_id_1');
      //console.log('Legacy index dropped.');
    }

    const compoundIndexName = 'platform_1_content_id_1';
    const compoundIndex = indexes.find(idx => idx.name === compoundIndexName);
    if (!compoundIndex) {
      //console.log('Creating compound unique index platform_1_content_id_1 on contents collection...');
      await Content.collection.createIndex({ platform: 1, content_id: 1 }, { unique: true, name: compoundIndexName });
      //console.log('Compound index created.');
    }
  } catch (error) {
    if (error.code !== 27) {
      console.error('Error fixing indexes:', error.message);
    }
  }
};

const ensureSearchHistoryIndexes = async () => {
  try {
    const indexes = await SearchHistory.collection.indexes();
    const desiredTextIndexName = 'user_id_1_query_text_results_search_text_text';

    for (const idx of indexes) {
      const hasTextKey = Object.values(idx.key || {}).includes('text');
      if (!hasTextKey) continue;

      const isDesired = idx.name === desiredTextIndexName;
      if (!isDesired) {
        try {
          await SearchHistory.collection.dropIndex(idx.name);
          console.log(`[SearchHistory] Dropped legacy text index: ${idx.name}`);
        } catch (dropErr) {
          console.warn(`[SearchHistory] Could not drop index ${idx.name}: ${dropErr.message}`);
        }
      }
    }

    await SearchHistory.createIndexes();
    console.log('[SearchHistory] Indexes ensured');
  } catch (error) {
    console.error('[SearchHistory] Failed to ensure indexes:', error.message);
  }
};

const ensureReportIndexes = async () => {
  try {
    await Report.createIndexes();
    console.log('[Report] Indexes ensured');
  } catch (error) {
    console.error('[Report] Failed to ensure indexes:', error.message);
  }
};

const buildSearchHistoryResultsText = (results) => {
  if (!Array.isArray(results) || results.length === 0) return '';

  const snippets = [];
  for (const item of results.slice(0, 300)) {
    if (!item || typeof item !== 'object') continue;

    const parts = [
      item.text,
      item.title,
      item.description,
      item.author,
      item.author_handle,
      item.channelTitle,
      item.screen_name,
      item.name,
      item.url,
      item.content_url
    ]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (parts.length > 0) snippets.push(parts.join(' '));
  }

  return snippets.join(' ').slice(0, 20000).toLowerCase();
};

const backfillSearchHistoryResultsText = async () => {
  try {
    const docs = await SearchHistory.find({
      $or: [
        { results_search_text: { $exists: false } },
        { results_search_text: '' }
      ]
    })
      .select('_id results')
      .limit(2000)
      .lean();

    if (!docs.length) return;

    const bulkOps = docs.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { results_search_text: buildSearchHistoryResultsText(doc.results) } }
      }
    }));

    if (bulkOps.length > 0) {
      await SearchHistory.bulkWrite(bulkOps, { ordered: false });
      console.log(`[SearchHistory] Backfilled results_search_text for ${bulkOps.length} records`);
    }
  } catch (error) {
    console.error('[SearchHistory] Backfill failed:', error.message);
  }
};

// Grievance Auto-Fetch Scheduler - interval driven by api_config.grievances
let grievanceSchedulerRunning = false;

const startGrievanceScheduler = () => {
  // Run immediately on startup (after a small delay to let everything initialize)
  setTimeout(async () => {
    await runGrievanceFetch();
  }, 30000); // 30 second delay on startup

  // Then run on a dynamic interval loop
  const scheduleNext = async () => {
    let intervalMs = 60 * 60 * 1000; // default 60 min
    try {
      const settings = await Settings.findOne({ id: 'global_settings' });
      // Use the smaller of the two platform intervals (x, facebook)
      const xMin = settings?.api_config?.grievances?.x || 60;
      const fbMin = settings?.api_config?.grievances?.facebook || 60;
      intervalMs = Math.min(xMin, fbMin) * 60 * 1000;
    } catch (_) { /* use default */ }
    setTimeout(async () => {
      await runGrievanceFetch();
      scheduleNext();
    }, intervalMs);
  };
  scheduleNext();
};

const runGrievanceFetch = async () => {
  // Prevent concurrent runs
  if (grievanceSchedulerRunning) {
    return;
  }

  try {
    grievanceSchedulerRunning = true;

    // Check if grievances are enabled in api_config
    const settings = await Settings.findOne({ id: 'global_settings' });
    if (settings?.api_config?.grievances?.enabled === false) {
      return;
    }

    // Check if there are any active grievance sources
    const activeSources = await GrievanceSource.countDocuments({ is_active: true });
    if (activeSources === 0) {
      return;
    }

    // Fetch grievances between MIN and MAX days old (default: 30-90 days),
    // skipping anything more recent than MIN days.
    const maxDays = Number(process.env.MONITOR_LOOKBACK_MAX_DAYS || 90);
    const minDays = Number(process.env.MONITOR_LOOKBACK_MIN_DAYS || 30);
    const safeMaxDays = Number.isFinite(maxDays) && maxDays > 0 ? maxDays : 90;
    const safeMinDays = Number.isFinite(minDays) && minDays >= 0 ? minDays : 30;
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - safeMaxDays);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - safeMinDays);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const result = await grievanceService.fetchAllGrievances(startDateStr, endDateStr);

  } catch (error) {
    console.error('[Grievance Scheduler] Error during auto-fetch:', error.message);
  } finally {
    grievanceSchedulerRunning = false;
  }
};

// ─── Frequent Engagers Auto-Queue ──────────────────────────────────────────
// Analysis was previously only ever triggered by a manual button click.
// This runs it automatically in the background, one monitored X handle per
// tick (autoQueueNewHandles already skips handles analyzed within the last
// 7 days and respects the single-flight processing lock).
const startEngagerAutoQueue = () => {
  const tick = async () => {
    try {
      const { autoQueueNewHandles } = require('./services/engagerAnalysisService');
      await autoQueueNewHandles();
    } catch (err) {
      console.warn('[EngagerAutoQueue] tick failed:', err.message);
    }
  };
  setTimeout(tick, 2 * 60 * 1000); // first run 2 minutes after startup
  setInterval(tick, 60 * 60 * 1000); // then hourly
};

// ─── Content Availability Checker ──────────────────────────────────────────
let availabilityCheckerRunning = false;

const startAvailabilityChecker = () => {
  const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

  // Run first check 2 minutes after startup
  setTimeout(async () => {
    await runAvailabilityCheckOnce();
  }, 2 * 60 * 1000);

  setInterval(async () => {
    await runAvailabilityCheckOnce();
  }, INTERVAL_MS);
};

const runAvailabilityCheckOnce = async () => {
  if (availabilityCheckerRunning) return;
  availabilityCheckerRunning = true;
  try {
    const { runFullAvailabilityCheck } = require('./services/availabilityCheckerService');
    const stats = await runFullAvailabilityCheck();
    console.log('[AvailabilityChecker] Scheduled check complete:', JSON.stringify(stats));
  } catch (err) {
    console.error('[AvailabilityChecker] Scheduled check error:', err.message);
  } finally {
    availabilityCheckerRunning = false;
  }
};

const startServer = async () => {
  // Connect to database
  await connectDB();

  // Create default admin
  await createDefaultAdmin();

  // Create default settings
  await createDefaultSettings();

  // Seed sources
  // await seedSources();

  // Fix indexes
  await fixIndexes();
  await ensureReportIndexes();
  await ensureSearchHistoryIndexes();
  await backfillSearchHistoryResultsText();

  // Seed default velocity alert thresholds
  await seedDefaultThresholds();

  // Master calendar seed disabled — events are created manually only
  // await seedRecurringEvents();

  // Auto-creation from master calendar disabled — events are now created manually only
  // await syncCalendarToEvents();

  // Start Monitoring Service OR temp content processor (engine mode)
  const useEngine = String(process.env.USE_ENGINE || 'false').toLowerCase() === 'true';
  if (useEngine) {
    console.log('[Server] USE_ENGINE=true -> starting temp content processor and skipping direct monitoring fetch loops');
    startTempContentProcessor();
  } else {
    console.log('[Server] USE_ENGINE=false -> starting existing monitoring service');
    startMonitoring();
  }

  // Start Grievance Auto-Fetch Scheduler only in legacy mode.
  if (!useEngine) {
    startGrievanceScheduler();
  } else {
    console.log('[Server] USE_ENGINE=true -> skipping backend Grievance Auto-Fetch (handled by engine)');
  }

  // Start Content Availability Checker
  startAvailabilityChecker();

  // Start Frequent Engagers Auto-Queue
  startEngagerAutoQueue();

  // Retweet Sync Scheduler — DISABLED (now on-demand via Frequent Engagers button)
  // try {
  //   const { startRetweetSyncScheduler } = require('./services/retweetNetworkService');
  //   startRetweetSyncScheduler();
  // } catch (err) {
  //   console.warn('[Server] Could not initialize Retweet Sync Scheduler:', err.message);
  // }

  // Start Telegram Auto-Sync/Scrape only in legacy mode.
  if (!useEngine) {
    try {
      const telegramService = require('./services/telegramService');
      telegramService.startTelegramAutoSync();
    } catch (err) {
      console.warn('[Server] Could not initialize Telegram Auto-Sync:', err.message);
    }
  } else {
    console.log('[Server] USE_ENGINE=true -> skipping backend Telegram Auto-Sync (handled by engine)');
  }

  const PORT = process.env.PORT || 8000;

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
