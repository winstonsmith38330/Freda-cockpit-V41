// Freda Ops Cockpit Beta 0.2.40
// Render injects environment variables directly. No dotenv import required.
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { parsePageTextCapture } from './src/captureParser.js';
import { readJson, writeJson, emptyLiveState, mergeLive, applySyncResult, addCapture, addWhatsapp, saveShapeMap, addCandidate, addTrainingCompletion, addAudit } from './src/store.js';
import { syncReportingSite, reportingDiagnostics } from './src/connectors/reportingSiteConnector.js';
import { syncUber, uberDiagnostics } from './src/connectors/uberConnector.js';
import { syncSquare, diagnoseSquare, squareDiagnostics } from './src/connectors/squareConnector.js';
import { syncWhatsappUpload, syncWhatsappImports, whatsappDiagnostics } from './src/connectors/whatsappConnector.js';
import { syncAll, syncRecentFallback } from './src/services/syncService.js';
import { syncFileImports, fileImportDiagnostics } from './src/importers/fileImportService.js';
import { analyseOperations } from './src/services/operationsAnalysis.js';
import { analyseProductionMix } from './src/services/productionMix.js';
import { buildBriefing } from './src/services/briefingEngine.js';
import { normalizeReportingDate, currentDateInTimeZone } from './src/utils/dateUtils.js';
import { maskSecret } from './src/utils/safe.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const upload = multer({ dest: path.join(__dirname, 'uploads/'), limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 200 * 1024 * 1024) } });
const PORT = process.env.PORT || 8787;
const DATA_PATH = path.resolve(__dirname, process.env.SEED_DATA_PATH || '../seed-data.json');
const LIVE_PATH = path.resolve(__dirname, process.env.LIVE_DATA_PATH || './data/live-snapshots.json');
const WEB_PATH = path.resolve(__dirname, '../web');

process.on('unhandledRejection', err => {
  console.error('[unhandledRejection]', err?.stack || err?.message || err);
});
process.on('uncaughtException', err => {
  console.error('[uncaughtException]', err?.stack || err?.message || err);
});

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(err => sendJsonError(res, err));
}
function sendJsonError(res, err, status = 500) {
  const message = err?.message || String(err || 'Unknown server error');
  console.error('[api-error]', message, err?.stack || '');
  if (!res.headersSent) res.status(status).json({ ok: false, error: message, type: err?.name || 'ServerError' });
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map(x => x.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.includes('*') ? true : allowedOrigins, credentials: true }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

function seed() { return readJson(DATA_PATH, {}); }
function liveRaw() { return readJson(LIVE_PATH, emptyLiveState()); }
function saveLive(data) { return writeJson(LIVE_PATH, data); }
function liveMerged(reportingDateOverride = null) {
  const raw = liveRaw();
  const effectiveRaw = reportingDateOverride ? { ...raw, reportingDate: reportingDateOverride } : raw;
  const live = mergeLive(seed(), effectiveRaw);
  const analysis = analyseOperations(live);
  const production = analyseProductionMix(live);
  const briefing = buildBriefing(live, analysis, production);
  return { ...live, analysis, production, briefing };
}
function reportingDateFrom(req) { return normalizeReportingDate(req.body?.reportingDate || req.query?.reportingDate || req.body?.date || req.query?.date || liveRaw().reportingDate, process.env.TIMEZONE || 'Australia/Sydney'); }

function isEnabled(value) { return String(value || '').toLowerCase() === 'true' || String(value || '') === '1'; }
function browserSyncEnvStatus() {
  return {
    enabled: isEnabled(process.env.ENABLE_BROWSER_SYNC),
    forceBrowserSync: isEnabled(process.env.REPORTING_FORCE_BROWSER_SYNC) || isEnabled(process.env.FORCE_BROWSER_SYNC),
    playwrightHeadless: process.env.PLAYWRIGHT_HEADLESS || 'true',
    playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH || '',
    browserSyncTimeoutMs: Number(process.env.BROWSER_SYNC_TIMEOUT_MS || 45000),
    reportingRequestDelayMs: Number(process.env.REPORTING_REQUEST_DELAY_MS || 2500),
    reportingBrowserViews: process.env.REPORTING_BROWSER_VIEWS || '',
    reportingBrowserContextPostFirst: process.env.REPORTING_BROWSER_CONTEXT_POST_FIRST || 'true',
    reportingForceSelectedDatePost: process.env.REPORTING_FORCE_SELECTED_DATE_POST || 'true',
    note: '0.2.40 keeps V31/V34 POS browser sync untouched and adds Uber/Frieda theoretical fallback display when online/uploaded external sales are missing.'
  };
}
async function browserSyncProbe() {
  const status = browserSyncEnvStatus();
  const probe = { ...status, playwrightPackageAvailable: false, chromiumTypeAvailable: false, chromiumExecutablePath: '', chromiumExecutableExists: false, error: '' };
  try {
    const mod = await import('playwright');
    probe.playwrightPackageAvailable = true;
    probe.chromiumTypeAvailable = Boolean(mod.chromium);
    if (mod.chromium?.executablePath) {
      const exe = mod.chromium.executablePath();
      probe.chromiumExecutablePath = exe;
      probe.chromiumExecutableExists = fs.existsSync(exe);
    }
  } catch (err) {
    probe.error = err?.message || String(err || 'Playwright probe failed');
  }
  return probe;
}
function browserEnabled() { return isEnabled(process.env.ENABLE_BROWSER_SYNC); }
function uniqueStrings(values = []) {
  return [...new Set((values || []).flat().filter(Boolean).map(x => String(x)).filter(Boolean))];
}
function summariseStoreRun(run = {}) {
  return { reportingDate: run.reportingDate, ok: run.ok, status: run.status, periodMatched: run.periodMatched, stores: Object.keys(run.reportingPOS || run.uberEats || {}), details: run.details, errors: uniqueStrings(run.errors || []), warnings: uniqueStrings(run.warnings || []) };
}
function posBrowserOpts(extra = {}) { return { ...extra, forceBrowserSync: browserEnabled(), browserOnly: browserEnabled() }; }

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'freda-ops-cockpit-server',
    version: '0.2.40',
    webPath: WEB_PATH,
    webIndexExists: fs.existsSync(path.join(WEB_PATH, 'index.html')),
    livePath: LIVE_PATH
  });
});

app.get('/api/config/status', (_req, res) => {
  res.json({
    ok: true,
    service: 'freda-ops-cockpit-server',
    version: '0.2.40',
    timezone: process.env.TIMEZONE || 'Australia/Sydney',
    nodeVersion: process.version,
    storage: { livePath: LIVE_PATH, prototypeJsonStorage: true, liveExists: fs.existsSync(LIVE_PATH) },
    imports: fileImportDiagnostics(process.env),
    env: {
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ? 'present' : 'missing',
      REPORTING_COOKIE: maskSecret(process.env.REPORTING_COOKIE || ''),
      REPORTING_PHPSESSID: maskSecret(process.env.REPORTING_PHPSESSID || ''),
      UBER_COOKIE: maskSecret(process.env.UBER_COOKIE || ''),
      SQUARE_ACCESS_TOKEN: maskSecret(process.env.SQUARE_ACCESS_TOKEN || ''),
      SQUARE_LOCATION_ID: maskSecret(process.env.SQUARE_LOCATION_ID || ''),
      OPENAI_API_KEY: maskSecret(process.env.OPENAI_API_KEY || ''),
      ENABLE_BROWSER_SYNC: process.env.ENABLE_BROWSER_SYNC ? 'present' : 'missing',
      PLAYWRIGHT_HEADLESS: process.env.PLAYWRIGHT_HEADLESS ? 'present' : 'missing',
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ? 'present' : 'missing',
      BROWSER_SYNC_TIMEOUT_MS: process.env.BROWSER_SYNC_TIMEOUT_MS ? 'present' : 'missing',
      REPORTING_REQUEST_DELAY_MS: process.env.REPORTING_REQUEST_DELAY_MS ? 'present' : 'missing',
      REPORTING_BROWSER_VIEWS: process.env.REPORTING_BROWSER_VIEWS ? 'present' : 'missing',
      REPORTING_BROWSER_CONTEXT_POST_FIRST: process.env.REPORTING_BROWSER_CONTEXT_POST_FIRST ? 'present' : 'missing',
      REPORTING_FORCE_SELECTED_DATE_POST: process.env.REPORTING_FORCE_SELECTED_DATE_POST ? 'present' : 'missing',
      UBER_ONLINE_ONLY: process.env.UBER_ONLINE_ONLY ? 'present' : 'missing',
      UBER_FILE_IMPORT_ENABLED: process.env.UBER_FILE_IMPORT_ENABLED ? process.env.UBER_FILE_IMPORT_ENABLED : 'false/default',
      UBER_BROWSER_SETTLE_MS: process.env.UBER_BROWSER_SETTLE_MS ? 'present' : 'missing'
    },
    browserSync: browserSyncEnvStatus(),
    reporting: reportingDiagnostics(process.env)
  });
});

app.get('/api/diagnostics/browser-sync', asyncRoute(async (_req, res) => {
  res.json({ ok: true, version: '0.2.40', diagnostics: await browserSyncProbe() });
}));

app.get('/api/seed', (_req, res) => res.json(seed()));
app.get('/api/live/summary', asyncRoute(async (req, res) => {
  const date = req.query?.reportingDate ? normalizeReportingDate(req.query.reportingDate, process.env.TIMEZONE || 'Australia/Sydney') : null;
  // 0.2.40: if the new Render service has no import cache yet, lazily load
  // uploaded Uber/Frieda/production files once so WTD and theoretical fallback
  // cards do not stay at zero after a fresh deploy. POS sync remains primary.
  let raw = liveRaw();
  if (!raw.fileImportCache?.generatedAt && String(process.env.AUTO_LOAD_IMPORTS_ON_SUMMARY ?? 'true').toLowerCase() !== 'false') {
    const imports = await syncFileImports(process.env, { reportingDate: date || raw.reportingDate || currentDateInTimeZone(process.env.TIMEZONE || 'Australia/Sydney') });
    raw = applySyncResult(raw, imports);
    saveLive(raw);
  }
  res.json({ ok: true, live: liveMerged(date), generatedAt: new Date().toISOString() });
}));

app.get('/api/diagnostics/connectors', (_req, res) => {
  res.json({ ok: true, generatedAt: new Date().toISOString(), imports: fileImportDiagnostics(process.env), reporting: reportingDiagnostics(process.env), uber: uberDiagnostics(process.env), square: squareDiagnostics(process.env), whatsapp: whatsappDiagnostics() });
});
app.get('/api/import/status', (_req, res) => res.json({ ok: true, diagnostics: fileImportDiagnostics(process.env), live: liveMerged() }));
app.get('/api/diagnostics/reporting', (_req, res) => res.json({ ok: true, diagnostics: reportingDiagnostics(process.env) }));
app.get('/api/diagnostics/uber', (_req, res) => res.json({ ok: true, diagnostics: uberDiagnostics(process.env) }));
app.get('/api/diagnostics/square', asyncRoute(async (_req, res) => res.json({ ok: true, diagnostics: await diagnoseSquare(process.env, fetch) })));


app.post('/api/import/reload', asyncRoute(async (req, res) => {
  const result = await syncFileImports(process.env, { ...(req.body || {}), reportingDate: reportingDateFrom(req) });
  const next = applySyncResult(liveRaw(), result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged() });
}));
app.post('/api/sync/imports', asyncRoute(async (req, res) => {
  const result = await syncFileImports(process.env, { ...(req.body || {}), reportingDate: reportingDateFrom(req) });
  const next = applySyncResult(liveRaw(), result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged() });
}));

app.post('/api/sync/all', asyncRoute(async (req, res) => {
  const result = await syncAll(process.env, fetch, { ...(req.body || {}), reportingDate: reportingDateFrom(req) });
  const next = applySyncResult(liveRaw(), result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged() });
}));

app.post('/api/sync/recent', asyncRoute(async (req, res) => runPosBenchmarks(req, res)));
app.post('/api/sync/pos/benchmarks', asyncRoute(async (req, res) => runPosBenchmarks(req, res)));
app.post('/api/sync/pos/current-plus-last-days', asyncRoute(async (req, res) => runPosBenchmarks(req, res)));
app.post('/api/sync/pos/all-days', asyncRoute(async (req, res) => runPosBenchmarks(req, res)));
app.post('/api/sync/pos/benchmarks-browser', asyncRoute(async (req, res) => runPosBenchmarks(req, res)));

app.post('/api/sync/pos/day', asyncRoute(async (req, res) => {
  // 0.2.40: when browser sync is enabled, the normal POS button uses the same
  // proven browser path as the diagnostic endpoint. This is the path Freda uses.
  if (browserEnabled()) return runPosBrowserSequential(req, res);
  const result = await syncReportingSite(posDayEnv(), fetch, posBrowserOpts({ ...(req.body || {}), reportingDate: reportingDateFrom(req), liveFallback: true, recentOnly: true, dayOnly: true }));
  const next = applySyncResult(liveRaw(), result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged(result.reportingDate) });
}));

app.post('/api/sync/pos/day-browser', asyncRoute(async (req, res) => runPosBrowserSequential(req, res)));
app.post('/api/sync/pos/day-browser-store', asyncRoute(async (req, res) => runPosBrowserSequential(req, res)));
app.post('/api/sync/pos/browser', asyncRoute(async (req, res) => runPosBrowserSequential(req, res)));

app.post('/api/sync/pos/backfill', asyncRoute(async (req, res) => runPosBackfill(req, res)));

app.post('/api/sync/pos', asyncRoute(async (req, res) => {
  if (browserEnabled()) return runPosBrowserSequential(req, res);
  const result = await syncReportingSite(posDayEnv(), fetch, posBrowserOpts({ ...(req.body || {}), reportingDate: reportingDateFrom(req), liveFallback: true, recentOnly: true, dayOnly: true }));
  const next = applySyncResult(liveRaw(), result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged(result.reportingDate) });
}));

app.post('/api/sync/uber', asyncRoute(async (req, res) => runUberSelected(req, res)));
app.post('/api/sync/uber/day', asyncRoute(async (req, res) => runUberSelected(req, res)));
app.post('/api/sync/uber/online', asyncRoute(async (req, res) => runUberSelected(req, res)));
app.post('/api/sync/uber/store', asyncRoute(async (req, res) => runUberSelected(req, res)));
app.post('/api/sync/uber/current-plus-last-days', asyncRoute(async (req, res) => runUberBenchmarks(req, res)));
app.post('/api/sync/uber/all-days', asyncRoute(async (req, res) => runUberBenchmarks(req, res)));
app.post('/api/sync/uber/benchmarks', asyncRoute(async (req, res) => runUberBenchmarks(req, res)));


app.post('/api/sync/square', asyncRoute(async (req, res) => {
  const result = await syncSquare(process.env, fetch, { ...(req.body || {}), reportingDate: reportingDateFrom(req) });
  const next = applySyncResult(liveRaw(), result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged() });
}));

app.post('/api/sync/whatsapp', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No WhatsApp .txt/.zip file uploaded.' });
  try {
    const result = syncWhatsappUpload(req.file);
    if (!result.ok) return res.status(400).json(result);
    const next = addWhatsapp(liveRaw(), result);
    saveLive(next);
    res.json({ ok: true, result, live: liveMerged() });
  } finally {
    fs.promises.unlink(req.file.path).catch(() => {});
  }
});

app.post('/api/sync/whatsapp/imports', (_req, res) => {
  const result = syncWhatsappImports(process.env);
  if (!result.ok) return res.status(400).json(result);
  // Full refresh mode: GitHub import folder is the source of truth for WhatsApp.
  // Clear previous WhatsApp state before applying the newly committed exports.
  const cleared = { ...liveRaw(), updatedAt: new Date().toISOString(), whatsapp: { summaries: [], actions: [] } };
  let next = addWhatsapp(cleared, result);
  if (Array.isArray(result.importedSummaries) && result.importedSummaries.length) {
    next = {
      ...next,
      whatsapp: {
        ...next.whatsapp,
        summaries: result.importedSummaries.slice(0, 20),
        actions: (result.actions || []).slice(0, 120)
      }
    };
  }
  saveLive(next);
  res.json({ ok: true, result, live: liveMerged() });
});
app.post('/api/whatsapp/imports', (_req, res) => {
  const result = syncWhatsappImports(process.env);
  if (!result.ok) return res.status(400).json(result);
  const cleared = { ...liveRaw(), updatedAt: new Date().toISOString(), whatsapp: { summaries: [], actions: [] } };
  let next = addWhatsapp(cleared, result);
  if (Array.isArray(result.importedSummaries) && result.importedSummaries.length) {
    next = {
      ...next,
      whatsapp: {
        ...next.whatsapp,
        summaries: result.importedSummaries.slice(0, 20),
        actions: (result.actions || []).slice(0, 120)
      }
    };
  }
  saveLive(next);
  res.json({ ok: true, result, live: liveMerged() });
});
app.post('/api/sync/whatsapp/clear', (_req, res) => {
  const next = { ...liveRaw(), updatedAt: new Date().toISOString(), whatsapp: { summaries: [], actions: [] } };
  saveLive(next);
  res.json({ ok: true, status: 'cleared', live: liveMerged() });
});
app.post('/api/whatsapp/clear', (_req, res) => {
  const next = { ...liveRaw(), updatedAt: new Date().toISOString(), whatsapp: { summaries: [], actions: [] } };
  saveLive(next);
  res.json({ ok: true, status: 'cleared', live: liveMerged() });
});

app.post('/api/captures/browser', (req, res) => {
  const body = req.body || {};
  const period = normalizeReportingDate(body.period || body.reportingDate || liveRaw().reportingDate, process.env.TIMEZONE || 'Australia/Sydney');
  const parsed = parsePageTextCapture(body.source || body.url || 'browser-capture', body.text || body.pageText || '', { store: body.store || inferStore(`${body.url || ''} ${body.title || ''}`), period });
  const next = addCapture(liveRaw(), { source: body.source || 'browser-capture', store: body.store || inferStore(body.url || body.title || ''), period, url: body.url || '', title: body.title || '', parsed });
  saveLive(next);
  res.json({ ok: true, parsed, live: liveMerged(), note: 'Manual capture is emergency/diagnostic only. Normal 0.2.40 workflow is file-import baseline plus isolated POS day/backfill fallback.' });
});

// Backward-compatible endpoints from earlier betas.
async function runPosSync(req, res) {
  const result = await syncReportingSite(process.env, fetch, { ...(req.body || {}), reportingDate: reportingDateFrom(req) });
  const next = applySyncResult(liveRaw(), result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged() });
}
async function runUberSelected(req, res) {
  const reportingDate = reportingDateFrom(req);
  const result = await syncUber(process.env, fetch, { ...(req.body || {}), reportingDate });
  const next = applySyncResult(liveRaw(), result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged(reportingDate) });
}

async function runUberBenchmarks(req, res) {
  const baseDate = reportingDateFrom(req);
  const dates = benchmarkDates(baseDate);
  const startedAt = new Date().toISOString();
  const runs = [];
  let next = liveRaw();
  for (const reportingDate of dates) {
    const run = await syncUber(process.env, fetch, { ...(req.body || {}), reportingDate });
    runs.push(run);
    next = applySyncResult(next, run);
    saveLive(next);
  }
  const latestRuns = runs.filter(r => r.reportingDate === baseDate);
  const result = {
    ok: runs.some(r => r.ok),
    status: runs.every(r => r.ok) ? 'success' : runs.some(r => r.ok) ? 'partial_success' : 'not_synced',
    source: 'Uber Eats Manager',
    mode: 'uber-online-current-plus-last-days',
    reportingDate: baseDate,
    startedAt,
    finishedAt: new Date().toISOString(),
    dates,
    runCount: runs.length,
    uberEats: Object.assign({}, ...latestRuns.map(r => r.uberEats || {})),
    runs: runs.map(summariseStoreRun),
    warnings: uniqueStrings(runs.flatMap(r => r.warnings || [])),
    errors: uniqueStrings(runs.flatMap(r => r.errors || []))
  };
  next = applySyncResult(next, result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged(baseDate) });
}

async function runUberSync(req, res) {
  return runUberSelected(req, res);
}
async function runSquareSync(req, res) {
  const result = await syncSquare(process.env, fetch, { ...(req.body || {}), reportingDate: reportingDateFrom(req) });
  const next = applySyncResult(liveRaw(), result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged() });
}
app.post('/api/live/pos-ticket-sync', runPosSync);
app.post('/api/live/reporting/sync', runPosSync);
app.post('/api/live/uber/sync', runUberSync);
app.post('/api/live/square/sync', runSquareSync);
app.post('/api/bookmarklet/capture', (req, res) => {
  const body = req.body || {};
  const period = normalizeReportingDate(body.period || body.reportingDate || liveRaw().reportingDate, process.env.TIMEZONE || 'Australia/Sydney');
  const parsed = parsePageTextCapture(body.source || body.url || 'browser-capture', body.text || body.pageText || '', { store: body.store || inferStore(`${body.url || ''} ${body.title || ''}`), period });
  const next = addCapture(liveRaw(), { source: body.source || 'browser-capture', store: body.store || inferStore(body.url || body.title || ''), period, url: body.url || '', title: body.title || '', parsed });
  saveLive(next);
  res.json({ ok: true, parsed, live: liveMerged(), note: 'Manual capture is emergency/diagnostic only. Normal 0.2.40 workflow is file-import baseline plus isolated POS day/backfill fallback.' });
});
app.post('/api/uploads', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded.' });
  const lower = req.file.originalname.toLowerCase();
  try {
    if (lower.endsWith('.txt') || lower.endsWith('.zip') || lower.includes('whatsapp')) {
      const result = syncWhatsappUpload(req.file);
      if (!result.ok) return res.status(400).json(result);
      const next = addWhatsapp(liveRaw(), result);
      saveLive(next);
      return res.json({ ok: true, result, live: liveMerged() });
    }
    return res.json({ ok: true, status: 'stored', note: 'Generic upload accepted. CSV/XLSX import mapping is staged.' });
  } finally {
    fs.promises.unlink(req.file.path).catch(() => {});
  }
});

app.post('/api/production/shape-map', (req, res) => {
  const next = saveShapeMap(liveRaw(), req.body?.shapeMap || req.body || []);
  saveLive(next);
  res.json({ ok: true, live: liveMerged() });
});

app.post('/api/hiring/candidates', (req, res) => {
  const next = addCandidate(liveRaw(), req.body || {});
  saveLive(next);
  res.json({ ok: true, live: liveMerged() });
});

app.post('/api/training/completions', (req, res) => {
  const next = addTrainingCompletion(liveRaw(), req.body || {});
  saveLive(next);
  res.json({ ok: true, live: liveMerged() });
});

app.post('/api/audits', (req, res) => {
  const next = addAudit(liveRaw(), req.body || {});
  saveLive(next);
  res.json({ ok: true, live: liveMerged() });
});

app.post('/api/actions/:id/status', (req, res) => {
  const state = liveRaw();
  const id = req.params.id;
  const status = req.body?.status || 'done';
  const actions = (state.actions || []).map(a => a.id === id ? { ...a, status, updatedAt: new Date().toISOString() } : a);
  const next = { ...state, updatedAt: new Date().toISOString(), actions };
  saveLive(next);
  res.json({ ok: true, live: liveMerged() });
});

app.post('/api/assistant', (req, res) => {
  const q = String(req.body?.question || '').toLowerCase();
  const live = liveMerged();
  let answer = live.briefing?.priorities?.join(' ') || 'Sync data first, then review store actions.';
  if (q.includes('sync')) answer = connectorAnswer(live);
  if (q.includes('sell')) answer = sellOutAnswer(live);
  if (q.includes('hour')) answer = hourlyAnswer(live);
  if (q.includes('staff') || q.includes('training') || q.includes('hire')) answer = 'Biggest focus: finding the right staff and training them. Use Hiring to screen applicants, Training/SOP for sign-off, and keep admin follow-up off Freda where possible.';
  if (q.includes('production') || q.includes('ball') || q.includes('ring')) answer = productionAnswer(live);
  res.json({ ok: true, answer, liveUpdatedAt: live.updatedAt });
});

app.use((err, _req, res, _next) => sendJsonError(res, err));

app.use(express.static(WEB_PATH, { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(WEB_PATH, 'index.html')));

app.listen(PORT, () => console.log(`Freda Ops Cockpit Beta 0.2.40 running on http://localhost:${PORT}`));

function posDayEnv() {
  return {
    ...process.env,
    REPORTING_SYNC_TIMEOUT_MS: String(process.env.POS_DAY_TIMEOUT_MS || process.env.REPORTING_DAY_TIMEOUT_MS || 45000),
    REPORTING_MAX_DATE_ATTEMPTS: String(process.env.REPORTING_MAX_DATE_ATTEMPTS || 5),
    REPORTING_DISABLE_TICKET_ENRICHMENT: 'true'
  };
}
function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function benchmarkDates(baseDate) {
  const selected = normalizeReportingDate(baseDate, process.env.TIMEZONE || 'Australia/Sydney');
  const dates = new Set([selected]);
  const monday = mondayOfLocal(selected);
  let cur = monday;
  while (cur < selected) { dates.add(cur); cur = addDaysIso(cur, 1); }
  for (const offset of [-7, -14, -21, -28]) dates.add(addDaysIso(selected, offset));
  // selected first, then more recent first for faster visible progress.
  return [selected, ...[...dates].filter(d => d !== selected).sort((a, b) => b.localeCompare(a))];
}
function mondayOfLocal(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function requestedBrowserStores(req) {
  const raw = req.body?.store || req.query?.store || req.body?.storeSlug || req.query?.storeSlug || req.body?.storeName || req.query?.storeName;
  if (!raw) return [
    { key: 'beverly_hills', name: 'Beverly Hills' },
    { key: 'penrith', name: 'Penrith' },
    { key: 'taren_point', name: 'Taren Point' }
  ];
  const s = String(raw).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (/bev|beverly|bh/.test(s)) return [{ key: 'beverly_hills', name: 'Beverly Hills' }];
  if (/pen|pn/.test(s)) return [{ key: 'penrith', name: 'Penrith' }];
  if (/taren|point|tp/.test(s)) return [{ key: 'taren_point', name: 'Taren Point' }];
  return [{ key: raw, name: String(raw) }];
}

async function runPosBrowserSequential(req, res) {
  const reportingDate = reportingDateFrom(req);
  const startedAt = new Date().toISOString();
  const stores = requestedBrowserStores(req);
  const runs = [];
  let next = liveRaw();
  for (const store of stores) {
    const run = await syncReportingSite(posDayEnv(), fetch, {
      ...(req.body || {}),
      store: store.key,
      reportingDate,
      liveFallback: true,
      recentOnly: true,
      dayOnly: true,
      browserOnly: true,
      forceBrowserSync: true,
      forceSelectedDate: true,
      diagnosticBrowserEndpoint: true,
      sequentialStoreSync: true
    });
    runs.push(run);
    next = applySyncResult(next, run);
    // 0.2.40: save immediately after each store, so a later store timeout cannot
    // lose a successful Beverly Hills/Penrith/Taren Point capture.
    saveLive(next);
  }
  const result = {
    ok: runs.some(r => r.ok),
    status: runs.every(r => r.ok) ? 'success' : runs.some(r => r.ok) ? 'partial_success' : 'not_synced',
    mode: 'reporting-site-browser-sequential-selected-date',
    source: 'reporting.site',
    reportingDate,
    periodMatched: runs.some(r => r.periodMatched),
    startedAt,
    finishedAt: new Date().toISOString(),
    reportingPOS: Object.assign({}, ...runs.map(r => r.reportingPOS || {})),
    ticketRowsByStore: Object.assign({}, ...runs.map(r => r.ticketRowsByStore || {})),
    details: runs.flatMap(r => r.details || []),
    runs: runs.map(r => ({ reportingDate: r.reportingDate, ok: r.ok, status: r.status, periodMatched: r.periodMatched, details: r.details, errors: r.errors, warnings: r.warnings })),
    warnings: uniqueStrings(runs.flatMap(r => r.warnings || [])),
    errors: uniqueStrings(runs.flatMap(r => r.errors || []))
  };
  next = applySyncResult(next, result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged(reportingDate) });
}

async function runPosBenchmarks(req, res) {
  const baseDate = reportingDateFrom(req);
  const dates = benchmarkDates(baseDate);
  const stores = requestedBrowserStores(req);
  const startedAt = new Date().toISOString();
  const runs = [];
  let next = liveRaw();

  // 0.2.40: this is the Freda-facing "Sync current + last days" path.
  // It uses the same proven browser/runtime-hourly path as selected-day sync,
  // but repeats it for the selected date, WTD prior days, same day last week,
  // and 4-week benchmark dates. Each store/date is saved immediately.
  for (const reportingDate of dates) {
    for (const store of stores) {
      const run = await syncReportingSite(posDayEnv(), fetch, {
        ...(req.body || {}),
        store: store.key,
        reportingDate,
        liveFallback: true,
        recentOnly: true,
        dayOnly: true,
        benchmarkSync: true,
        browserOnly: true,
        forceBrowserSync: true,
        forceSelectedDate: true,
        diagnosticBrowserEndpoint: true,
        sequentialStoreSync: true,
        currentPlusLastDaysSync: true
      });
      runs.push(run);
      next = applySyncResult(next, run);
      saveLive(next);
    }
  }

  const latestRuns = runs.filter(r => r.reportingDate === baseDate);
  const latestReportingPOS = Object.assign({}, ...latestRuns.map(r => r.reportingPOS || {}));
  const result = {
    ok: runs.some(r => r.ok),
    status: runs.every(r => r.ok) ? 'success' : runs.some(r => r.ok) ? 'partial_success' : 'not_synced',
    source: 'pos-current-plus-last-days-browser-sync',
    mode: 'pos-current-plus-last-days-selected-wtd-last-week-4-week-browser-sequential',
    reportingDate: baseDate,
    startedAt,
    finishedAt: new Date().toISOString(),
    dates,
    storeCount: stores.length,
    runCount: runs.length,
    reportingPOS: latestReportingPOS,
    runs: runs.map(r => ({ reportingDate: r.reportingDate, ok: r.ok, status: r.status, periodMatched: r.periodMatched, stores: Object.keys(r.reportingPOS || {}), details: r.details, errors: r.errors, warnings: r.warnings })),
    latestResult: latestRuns.length ? {
      ok: latestRuns.some(r => r.ok),
      status: latestRuns.every(r => r.ok) ? 'success' : latestRuns.some(r => r.ok) ? 'partial_success' : 'not_synced',
      reportingDate: baseDate,
      reportingPOS: latestReportingPOS,
      details: latestRuns.flatMap(r => r.details || [])
    } : (runs[0] || null),
    warnings: uniqueStrings(runs.flatMap(r => r.warnings || [])),
    errors: uniqueStrings(runs.flatMap(r => r.errors || []))
  };
  next = applySyncResult(next, result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged(baseDate) });
}

async function runPosBackfill(req, res) {
  const count = Math.max(1, Number(req.body?.days ?? req.body?.count ?? process.env.LIVE_FALLBACK_DAYS ?? 10));
  const baseDate = reportingDateFrom(req);
  const dates = Array.from({ length: count }, (_v, i) => addDaysIso(baseDate, -i));
  const startedAt = new Date().toISOString();
  const runs = [];
  let next = liveRaw();
  for (const reportingDate of dates) {
    const run = await syncReportingSite(posDayEnv(), fetch, posBrowserOpts({ ...(req.body || {}), reportingDate, liveFallback: true, recentOnly: true, dayOnly: true, backfill: true }));
    runs.push(run);
    next = applySyncResult(next, run);
    // Save after every date so a later timeout/failure cannot lose successful earlier dates.
    saveLive(next);
  }
  const result = {
    ok: runs.some(r => r.ok),
    status: runs.every(r => r.ok) ? 'success' : runs.some(r => r.ok) ? 'partial_success' : 'not_synced',
    source: 'pos-backfill-sequential',
    mode: 'pos-backfill-10-day-sequential-partial-save',
    reportingDate: baseDate,
    startedAt,
    finishedAt: new Date().toISOString(),
    dates,
    runs: runs.map(r => ({ reportingDate: r.reportingDate, ok: r.ok, status: r.status, periodMatched: r.periodMatched, details: r.details, errors: r.errors, warnings: r.warnings })),
    latestResult: runs[0] || null,
    warnings: uniqueStrings(runs.flatMap(r => r.warnings || [])),
    errors: uniqueStrings(runs.flatMap(r => r.errors || []))
  };
  next = applySyncResult(next, result);
  saveLive(next);
  res.json({ ok: result.ok, result, live: liveMerged(baseDate) });
}

function connectorAnswer(live) {
  const s = live.connectorStatus || {};
  return `POS: ${s.reportingSite?.status || 'not synced'}; Uber: ${s.uberEats?.status || 'not synced today'}; Square: ${s.square?.status || 'not synced today'}. Stale WTD/MTD values are excluded from daily totals.`;
}
function sellOutAnswer(live) {
  const rows = live.analysis?.sellOut || [];
  return rows.length ? rows.map(r => `${r.store}: ${r.status}`).join('; ') : 'No sell-out signals yet. Sync POS product/sold-out pages or upload WhatsApp stock messages.';
}
function hourlyAnswer(live) {
  const rows = live.analysis?.hourly || [];
  return rows.map(r => `${r.store}: ${r.status}${r.includesUber ? ' including Uber' : ''}`).join('; ') || 'Hourly comparison waits for POS/Uber same-day hourly rows.';
}
function productionAnswer(live) {
  const p = live.production || {};
  const shape = p.shapeSummary || {};
  const risk = p.stockRisk?.rows || [];
  const topRisk = risk.filter(r => r.risk === 'high' || r.risk === 'medium').slice(0, 3).map(r => `${r.store} ${r.shape} ${r.risk}: remaining ${r.remainingQty}, sell-out ${r.projectedSellOutTime || 'n/a'}`).join('; ');
  return `Production: daily ${shape.dailyTotal ?? 0} units, weekly ${shape.weeklyTotal ?? 0} units, BALL share ${shape.weeklyBallShare == null ? 'n/a' : Math.round(shape.weeklyBallShare * 1000) / 10 + '%'}. ${topRisk || (p.stockRisk?.dataGaps || []).join(' ') || p.warnings?.join(' ') || 'No shortage warning yet.'}`;
}
function inferStore(text = '') {
  const s = String(text).toLowerCase();
  if (s.includes('beverly')) return 'Beverly Hills';
  if (s.includes('penrith')) return 'Penrith';
  if (s.includes('taren')) return 'Taren Point';
  if (s.includes('frieda') || s.includes('frida') || s.includes('square')) return "Frieda's Pies";
  return '';
}
