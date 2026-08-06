require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const connectDB = require('./config/db');
const { startMonitoring } = require('./services/monitorService');
const { startTempContentProcessor } = require('./services/tempContentProcessor');
const { seedDefaultThresholds } = require('./services/velocityAlertService');
const grievanceService = require('./services/grievanceService');
const { seedRecurringEvents } = require('./controllers/masterCalendarController');
const User = require('./models/User');
const Settings = require('./models/Settings');
const Source = require('./models/Source');
const Content = require('./models/Content');
const GrievanceSource = require('./models/GrievanceSource');
const Keyword = require('./models/Keyword');
const { google } = require('googleapis');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const { buildEmailLookup, normalizeEmail, normalizeRole } = require('./utils/authIdentity');
const Alert = require('./models/Alert');
const Report = require('./models/Report');
const cacheService = require('./services/cacheService');

const app = express();

// Trust proxy for proper protocol detection behind nginx/load balancer
app.set('trust proxy', 1);

// Middleware
const allowedOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin header (server-to-server, curl, mobile apps).
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
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
app.use('/api/media', require('./routes/media.routes'));
app.use('/api/search', require('./routes/searchRoutes'));
app.use('/api/events', require('./routes/eventRoutes'));
app.use('/api/master-calendar', require('./routes/masterCalendarRoutes'));
app.use('/api/alert-thresholds', require('./routes/alertThresholdRoutes'));

app.use('/api/grievances', require('./routes/grievanceRoutes'));
app.use('/api/admin', require('./routes/profileSettingsRoutes'));
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
app.use('/api/policies', require('./routes/policyRoutes'));
app.use('/api/templates', require('./routes/templatesRoutes'));
app.use('/api/poi', require('./routes/poiRoutes'));
app.use('/api/telegram', require('./routes/telegramRoutes'));
app.use('/api/unrest', require('./routes/unrest.routes'));
app.use('/api/news',  require('./routes/newsRoutes'));
app.use('/api/intelligence-reports', require('./routes/intelligenceReportRoutes'));
app.use('/api/search-trends', require('./routes/searchTrends'));
app.use('/api/constituency-intel', require('./routes/constituencyIntelligenceRoutes'));
app.use('/api/geo-intel', require('./routes/geoIntelRoutes'));
app.use('/api/dashboard', require('./routes/apDashboardRoutes'));
app.use('/api/voter-profiles', require('./routes/voterProfileRoutes'));
app.use('/api/web-articles', require('./routes/webArticleRoutes'));

// Proxy for Location Service (to share ngrok tunnel)
app.post('/api/location-extraction/:path*', async (req, res) => {
  try {
    const locationServiceBaseUrl = String(process.env.LOCATION_SERVICE_URL || 'http://localhost:5002').trim().replace(/\/+$/, '');
    const targetUrl = `${locationServiceBaseUrl}/api/${req.params.path}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    const response = await axios({
      method: 'post',
      url: targetUrl,
      data: req.body,
      headers: { 'Content-Type': 'application/json' }
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

const upsertDefaultUser = async ({ email, password, full_name, role, previousEmails = [] }) => {
  const normalizedEmail = normalizeEmail(email);
  const lookupEmails = [normalizedEmail, ...previousEmails.map(normalizeEmail)].filter(Boolean);

  if (!normalizedEmail || !password || !full_name || !role) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const existingUser = await User.findOne({
    $or: lookupEmails.map((candidateEmail) => ({ email: buildEmailLookup(candidateEmail) }))
  });

  if (existingUser) {
    existingUser.email = normalizedEmail;
    existingUser.password = hashedPassword;
    existingUser.full_name = String(full_name).trim();
    existingUser.role = normalizeRole(role);
    existingUser.is_active = true;
    await existingUser.save();
    return;
  }

  await User.create({
    email: normalizedEmail,
    password: hashedPassword,
    full_name: String(full_name).trim(),
    role: normalizeRole(role),
    is_active: true
  });
};

// Default Admin/User Accounts
const createDefaultUsers = async () => {
  try {
    const defaultUsers = [
      {
        email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@blurasaga.local',
        password: process.env.DEFAULT_ADMIN_PASSWORD || '#BluraSaga@Telangana2026',
        full_name: process.env.DEFAULT_ADMIN_NAME || 'Blura Saga Super Admin',
        previousEmails: ['admin@bskwatch.in', 'bcss@blurasaga.com', 'admin@punjabsaga.com', 'admin@blurahub.com', 'admin@blurasaga.com'],
        role: 'superadmin'
      },
      {
        email: process.env.GRIEVANCE_ADMIN_EMAIL || 'sreenu@gmail.com',
        password: process.env.GRIEVANCE_ADMIN_PASSWORD || '123456',
        full_name: process.env.GRIEVANCE_ADMIN_NAME || 'Sreenu',
        role: 'superadmin'
      }
    ];

    for (const user of defaultUsers) {
      await upsertDefaultUser(user);
    }
  } catch (error) {
    //console.error(`Error creating default users: ${error.message}`);
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

// Grievance Auto-Fetch Scheduler - runs every 10 minutes
const GRIEVANCE_FETCH_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds
let grievanceSchedulerRunning = false;

const startGrievanceScheduler = () => {
  //console.log('[Grievance Scheduler] Starting auto-fetch every 10 minutes...');

  // Run immediately on startup (after a small delay to let everything initialize)
  setTimeout(async () => {
    await runGrievanceFetch();
  }, 30000); // 30 second delay on startup

  // Then run every 10 minutes
  setInterval(async () => {
    await runGrievanceFetch();
  }, GRIEVANCE_FETCH_INTERVAL);
};

const runGrievanceFetch = async () => {
  // Prevent concurrent runs
  if (grievanceSchedulerRunning) {
    //console.log('[Grievance Scheduler] Previous fetch still running, skipping...');
    return;
  }

  try {
    grievanceSchedulerRunning = true;

    // Check if there are any active grievance sources
    const activeSources = await GrievanceSource.countDocuments({ is_active: true });
    if (activeSources === 0) {
      //console.log('[Grievance Scheduler] No active grievance sources configured, skipping fetch');
      return;
    }

    //console.log(`[Grievance Scheduler] Auto-fetching grievances for ${activeSources} active sources...`);
    // Fetch grievances for today (no date filter = recent tweets)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const result = await grievanceService.fetchAllGrievances(todayStr, todayStr);
    //console.log(`[Grievance Scheduler] Auto-fetch complete: ${result.newGrievances} new grievances found`);

    // Also fetch keyword-based content from Facebook, Instagram, YouTube
    try {
      const kwResult = await grievanceService.fetchKeywordGrievances();
      //console.log(`[Grievance Scheduler] Keyword fetch complete: ${kwResult.newGrievances} new from keywords`);
    } catch (kwErr) {
      //console.error('[Grievance Scheduler] Keyword fetch error:', kwErr.message);
    }

  } catch (error) {
    //console.error('[Grievance Scheduler] Error during auto-fetch:', error.message);
  } finally {
    grievanceSchedulerRunning = false;
  }
};

// ─── Alerts → Grievances promotion (runs on an interval) ────────────────────
let alertsToMentionsRunning = false;
const startAlertsToMentionsScheduler = () => {
  const INTERVAL_MS = Number(process.env.ALERTS_TO_MENTIONS_INTERVAL_MS || 5 * 60 * 1000);
  const tick = async () => {
    if (alertsToMentionsRunning) return;
    alertsToMentionsRunning = true;
    try {
      const svc = require('./services/alertsToMentionsService');
      const limit = Number(process.env.BSK_ALERT_PROMOTE_BATCH || 200);
      const res = await svc.runBatch({ limit });
      console.log(`[AlertsToMentions] tick: processed=${res?.processed ?? '?'} promoted=${res?.promoted ?? '?'}`);
    } catch (err) {
      console.warn('[AlertsToMentions] tick failed:', err.message);
    } finally {
      alertsToMentionsRunning = false;
    }
  };
  // First run 90 s after startup so Mongo + caches are warm.
  setTimeout(tick, 90 * 1000);
  setInterval(tick, INTERVAL_MS);
};

// ─── Engager Analysis Auto-Queue (runs every hour) ───────────────────────────
const startEngagerAutoQueue = () => {
  // Lazy-require so a missing/optional service can't crash boot.
  const safeCall = async () => {
    try {
      const svc = require('./services/engagerAnalysisService');
      if (typeof svc.autoQueueNewHandles === 'function') {
        await svc.autoQueueNewHandles();
      }
    } catch (err) {
      console.warn('[EngagerAutoQueue] tick failed:', err.message);
    }
  };
  // First run 2 minutes after startup
  setTimeout(safeCall, 2 * 60 * 1000);
  // Then every 1 hour — processes one handle per run
  setInterval(safeCall, 60 * 60 * 1000);
};

// ─── Content Availability Checker (runs every 6 hours) ──────────────────────
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

// ─── Cache Warming Functions ──────────────────────────────────────────────────

const warmGatedAlertIdsCache = async () => {
  try {
    const gatedAlertIds = await Alert.find(
      { matched_keywords: { $exists: true, $ne: [] } },
      { id: 1 }
    ).lean().exec();
    const alertIdArray = gatedAlertIds.map(a => a.id);
    await cacheService.set('gated:alert:ids:v1', alertIdArray, 300); // 5 minutes
    console.log(`[CacheWarmup] Gated alert IDs cached: ${alertIdArray.length} alerts`);
    return alertIdArray.length;
  } catch (err) {
    console.error('[CacheWarmup] Failed to warm gated alert IDs cache:', err.message);
    return 0;
  }
};

const warmProfilesCache = async () => {
  try {
    // Get all gated alert IDs (use cache if available, otherwise query)
    let gatedAlertIds = [];
    try {
      const cached = await cacheService.get('gated:alert:ids:v1');
      if (cached) {
        gatedAlertIds = cached;
      }
    } catch (_) {
      // ignore cache miss, will query DB
    }

    if (gatedAlertIds.length === 0) {
      const alertDocs = await Alert.find(
        { matched_keywords: { $exists: true, $ne: [] } },
        { id: 1 }
      ).lean().exec();
      gatedAlertIds = alertDocs.map(a => a.id);
    }

    if (gatedAlertIds.length === 0) {
      console.log('[CacheWarmup] No gated alerts found, skipping profiles cache warming');
      return 0;
    }

    console.log(`[CacheWarmup] Looking for reports with ${gatedAlertIds.length} gated alert IDs...`);

    // Get all reports with gated alert IDs
    const allReports = await Report.find({
      alert_id: { $in: gatedAlertIds }
    }).lean().exec();

    console.log(`[CacheWarmup] Found ${allReports ? allReports.length : 0} reports in DB`);

    // Debug: Check total reports in collection
    const totalReportsInDb = await Report.countDocuments();
    console.log(`[CacheWarmup] Total reports in collection: ${totalReportsInDb}`);

    if (!allReports || allReports.length === 0) {
      console.log('[CacheWarmup] No reports match gated alert IDs - check if alert_id references are correct');
      return 0;
    }

    // Group by handle in JavaScript
    const profileMap = new Map();
    allReports.forEach(report => {
      const handle = report.target_user_details?.handle;
      if (!handle) return;

      if (!profileMap.has(handle)) {
        profileMap.set(handle, {
          handle,
          name: report.target_user_details?.name,
          avatar_url: report.target_user_details?.avatar_url,
          alertCount: 0,
          latestAlert: report.generated_at
        });
      }
      const profile = profileMap.get(handle);
      profile.alertCount++;
      if (new Date(report.generated_at) > new Date(profile.latestAlert)) {
        profile.latestAlert = report.generated_at;
      }
    });

    // Sort by alert count descending
    const sortedProfiles = Array.from(profileMap.values())
      .sort((a, b) => b.alertCount - a.alertCount || new Date(b.latestAlert) - new Date(a.latestAlert));

    // Cache for 1 HOUR (3600 seconds)
    await cacheService.set('profiles:all:grouped:v1', sortedProfiles, 3600);
    console.log(`[CacheWarmup] Profiles cache warmed: ${sortedProfiles.length} unique profiles from ${allReports.length} reports`);
    return sortedProfiles.length;
  } catch (err) {
    console.error('[CacheWarmup] Failed to warm profiles cache:', err.message);
    return 0;
  }
};

const startServer = async () => {
  // Connect to database
  await connectDB();

  // Create default users
  await createDefaultUsers();

  // Create default settings
  await createDefaultSettings();

  // Keywords + GrievanceSources are managed from the frontend.
  // No backend seeding. The DB-driven scheduler reads those collections fresh every tick.

  // Seed sources
  // await seedSources();

  // Fix indexes
  await fixIndexes();

  // Seed default velocity alert thresholds
  await seedDefaultThresholds();

  // Seed recurring master calendar events used by Events Report
  await seedRecurringEvents();

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

  // Start Engager Analysis Auto-Queue (every 15 minutes)
  startEngagerAutoQueue();

  // Start Alerts → Grievances promotion (every ALERTS_TO_MENTIONS_INTERVAL_MS,
  // default 5 min). Batch size + min confidence are controlled by
  // BSK_ALERT_PROMOTE_BATCH / BSK_ALERT_PROMOTE_MIN_CONF (env var names kept as-is).
  startAlertsToMentionsScheduler();

  // Start Content Availability Checker (every 6 hours)
  startAvailabilityChecker();

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

  // ─── Warm up caches before starting server ───
  console.log('[Server] Warming up caches for instant first-request performance...');
  await warmGatedAlertIdsCache();
  await warmProfilesCache();

  const PORT = process.env.PORT || 8000;

  app.listen(PORT, () => {
    console.log(`╔══════════════════════════════════════════════════════════╗`);
    console.log(`║  BLURA SAGA · A. Revanth Reddy · INC Telangana              ║`);
    console.log(`║  Social Media Intelligence backend listening on :${String(PORT).padEnd(6)}║`);
    console.log(`╚══════════════════════════════════════════════════════════╝`);
  });
};

startServer();