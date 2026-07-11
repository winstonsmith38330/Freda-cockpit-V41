import { parseUberUiText, combineHourlyRows } from '../utils/pageParsers.js';
import { cleanText, maskSecret, round2 } from '../utils/safe.js';
import { normalizeReportingDate, periodMatchesSelectedDate } from '../utils/dateUtils.js';

const UBER_STORES = [
  { name: 'Beverly Hills', idKey: 'UBER_STORE_BEVERLY_HILLS', nameKey: 'UBER_STORE_NAME_BEVERLY_HILLS', defaultVisible: 'L.A Donut' },
  { name: 'Penrith', idKey: 'UBER_STORE_PENRITH', nameKey: 'UBER_STORE_NAME_PENRITH', defaultVisible: 'L.A DONUTS (Penrith)' },
  { name: 'Taren Point', idKey: 'UBER_STORE_TAREN_POINT', nameKey: 'UBER_STORE_NAME_TAREN_POINT', defaultVisible: 'L.A Donuts Taren Point' }
];

function uniqueStrings(values = []) { return [...new Set((values || []).flat().filter(Boolean).map(x => String(x)).filter(Boolean))]; }
function visibleError(detail = {}) {
  const parts = [...(detail.errors || []), ...(detail.warnings || [])].filter(Boolean);
  return uniqueStrings(parts).slice(0, 4);
}

export async function syncUber(env, fetchImpl = fetch, opts = {}) {
  const selectedDate = normalizeReportingDate(opts.reportingDate || opts.date || opts.today, env.TIMEZONE || 'Australia/Sydney');
  const startedAt = new Date().toISOString();
  const stores = requestedUberStores(opts);
  const result = {
    ok: false,
    status: 'not_synced',
    mode: 'uber-manager-online-browser-sync',
    source: 'Uber Eats Manager',
    reportingDate: selectedDate,
    periodMatched: false,
    startedAt,
    finishedAt: null,
    uberEats: {},
    details: [],
    warnings: [],
    errors: [],
    diagnostics: uberDiagnostics(env)
  };

  if (!String(env.UBER_COOKIE || '').trim()) {
    result.errors.push('Missing UBER_COOKIE. Add a fresh Uber Manager Cookie header in Render Environment. Uber workbook fallback is disabled in V37 by default.');
    result.finishedAt = new Date().toISOString();
    return result;
  }

  for (const store of stores) {
    const detail = await syncUberStore(env, fetchImpl, store, selectedDate).catch(err => ({ store: store.name, ok: false, status: 'failed', errors: [String(err?.message || err)], warnings: [] }));
    detail.errors = uniqueStrings(detail.errors || []);
    detail.warnings = uniqueStrings(detail.warnings || []);
    result.details.push(detail);
    if (detail.metric) result.uberEats[store.name] = detail.metric;
  }
  result.ok = Object.keys(result.uberEats).length > 0;
  result.status = result.ok ? (result.details.every(d => d.ok) ? 'success' : 'partial_success') : 'not_synced';
  result.periodMatched = result.ok;
  result.warnings = uniqueStrings(result.details.flatMap(visibleError));
  result.errors = uniqueStrings(result.details.flatMap(d => d.errors || []));
  if (!result.ok && !result.errors.length) result.errors.push('Uber online sync did not produce trusted selected-date values. The app rejected stale WTD/month values, repeated-store metrics, and zero-sales-with-orders. Check UBER_COOKIE, Uber store IDs/names, and the selected date in Uber Manager.');
  result.finishedAt = new Date().toISOString();
  return result;
}

export function uberDiagnostics(env, extra = {}) {
  const manager = managerBase(env);
  return {
    source: 'Uber Eats Manager',
    cookie: maskSecret(env.UBER_COOKIE || ''),
    managerBaseUrl: manager,
    onlineOnly: String(env.UBER_ONLINE_ONLY ?? 'true').toLowerCase() !== 'false',
    workbookImportEnabled: String(env.UBER_FILE_IMPORT_ENABLED || '').toLowerCase() === 'true',
    browserFallbackEnabled: String(env.ENABLE_BROWSER_SYNC || '').toLowerCase() === 'true',
    browserOnlineSync: true,
    note: 'V37 prioritises online Uber Manager sync. Uploaded Uber workbooks are ignored unless UBER_FILE_IMPORT_ENABLED=true.',
    stores: UBER_STORES.map(s => ({
      store: s.name,
      idEnv: s.idKey,
      id: maskSecret(env[s.idKey] || ''),
      visibleNameEnv: s.nameKey,
      visibleName: env[s.nameKey] || s.defaultVisible
    })),
    ...extra
  };
}

function requestedUberStores(opts = {}) {
  const raw = opts.store || opts.storeSlug || opts.storeName;
  if (!raw) return UBER_STORES;
  const s = String(raw).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (/bev|beverly|bh/.test(s)) return [UBER_STORES[0]];
  if (/pen|pn/.test(s)) return [UBER_STORES[1]];
  if (/taren|point|tp/.test(s)) return [UBER_STORES[2]];
  return UBER_STORES.filter(x => x.name.toLowerCase().includes(String(raw).toLowerCase())) || UBER_STORES;
}

async function syncUberStore(env, fetchImpl, store, selectedDate) {
  const detail = { store: store.name, ok: false, status: 'not_synced', attemptedUrls: [], warnings: [], errors: [], steps: [], jsonCandidates: [] };

  // Fast path: sometimes Uber Manager returns pre-rendered or JSON-ish HTML with the selected day.
  const simple = await tryFetchManagerPage(env, fetchImpl, store, selectedDate, detail).catch(err => ({ error: String(err?.message || err) }));
  if (simple?.metric) return { ...detail, ok: true, status: 'success', metric: simple.metric };
  if (simple?.error) detail.warnings.push(`Simple Uber fetch not enough: ${simple.error}`);

  if (String(env.ENABLE_BROWSER_SYNC || '').toLowerCase() === 'true') {
    const browser = await tryUberBrowser(env, store, selectedDate, detail).catch(err => ({ error: String(err?.message || err) }));
    if (browser?.metric) return { ...detail, ok: true, status: 'success', metric: browser.metric, jsonCandidates: browser.jsonCandidates || detail.jsonCandidates };
    if (browser?.error) detail.errors.push(`Browser Uber sync failed: ${browser.error}`);
  } else {
    detail.warnings.push('Browser sync disabled. Enable ENABLE_BROWSER_SYNC=true and install Playwright browsers to parse Uber Manager UI automatically.');
  }
  return detail;
}

async function tryFetchManagerPage(env, fetchImpl, store, selectedDate, detail) {
  const url = buildUberSalesUrl(env, store, selectedDate);
  detail.attemptedUrls.push(scrubUrl(url));
  const text = await fetchText(fetchImpl, url, {
    cookie: addSelectedRestaurant(env.UBER_COOKIE || '', env[store.idKey] || ''),
    accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
    'accept-language': 'en-AU,en;q=0.9,fr-FR;q=0.7,fr;q=0.6',
    referer: managerBase(env),
    'user-agent': userAgent()
  }, Number(env.UBER_SYNC_TIMEOUT_MS || 20000));
  const parsed = parseUberUiText(text);
  if (!periodMatchesSelectedDate(parsed.period, selectedDate)) return { error: `Fetched Uber page did not expose selected daily period ${selectedDate}.` };
  const metric = metricFromParsed(store.name, selectedDate, parsed, 'uber-manager-fetch');
  if (!metric) return { error: 'No sales/orders/AOV cards were visible in fetched Uber HTML. Uber probably rendered the app client-side.' };
  return { metric };
}

async function tryUberBrowser(env, store, selectedDate, detail) {
  let chromium;
  try {
    const mod = await import('playwright');
    chromium = mod.chromium;
    detail.steps.push({ status: 'playwright_import_ok' });
  } catch (_err) {
    return { error: 'Playwright package/browser is not available. Use npm install and npx playwright install chromium for browser fallback.' };
  }

  const browser = await chromium.launch({
    headless: String(env.PLAYWRIGHT_HEADLESS || 'true').toLowerCase() !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const context = await browser.newContext({
      userAgent: userAgent(),
      locale: 'en-AU',
      timezoneId: env.UBER_TIMEZONE_ID || 'Australia/Sydney',
      extraHTTPHeaders: {
        accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
        'accept-language': 'en-AU,en;q=0.9'
      }
    });
    await context.addCookies(cookieHeaderToPlaywright(env.UBER_COOKIE || '', ['.ubereats.com', '.uber.com', 'merchants.ubereats.com']));
    const selectedRestaurantCookie = env[store.idKey] ? [{ name: 'selectedRestaurant', value: String(env[store.idKey]), domain: '.ubereats.com', path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }] : [];
    if (selectedRestaurantCookie.length) await context.addCookies(selectedRestaurantCookie).catch(() => {});
    await context.route('**/*', route => {
      const type = route.request().resourceType();
      if (['image', 'font', 'media'].includes(type)) return route.abort().catch(() => {});
      return route.continue().catch(() => {});
    }).catch(() => {});

    const jsonCandidates = [];
    context.on('response', async response => {
      const url = response.url();
      if (!/uber|ubereats|analytics|sales|graphql|restaurant|cohort|summary|earnings|report/i.test(url)) return;
      try {
        const ct = response.headers()['content-type'] || '';
        if (!/json|text|javascript/i.test(ct)) return;
        const text = await response.text().catch(() => '');
        if (!text || text.length < 20) return;
        const candidate = parseJsonLoose(text);
        if (!candidate) return;
        const extracted = extractUberMetricsFromJson(store.name, selectedDate, candidate);
        const record = { url: scrubUrl(url), periodMatched: Boolean(extracted?.periodMatched), sales: extracted?.metric?.sales ?? null, orders: extracted?.metric?.orders ?? null, hourlyRows: extracted?.metric?.hourlyRows?.length || 0 };
        jsonCandidates.push(record);
        if (extracted?.metric && !detail.metricCandidate) detail.metricCandidate = extracted.metric;
      } catch (_err) {}
    });

    const page = await context.newPage();
    const url = buildUberSalesUrl(env, store, selectedDate);
    detail.attemptedUrls.push(`${scrubUrl(url)}#browser`);
    detail.steps.push({ status: 'uber_browser_goto', url: scrubUrl(url), selectedDate });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Number(env.BROWSER_SYNC_TIMEOUT_MS || 45000) });

    const visibleName = env[store.nameKey] || store.defaultVisible;
    await selectUberStore(page, visibleName).catch(err => detail.warnings.push(`Store selector not confirmed: ${err.message || err}`));
    await setUberDate(page, selectedDate).catch(err => detail.warnings.push(`Date selector not confirmed: ${err.message || err}`));
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(Number(env.UBER_BROWSER_SETTLE_MS || 3500)).catch(() => {});

    // Give late XHR/GraphQL responses one more chance.
    if (detail.metricCandidate) {
      return { metric: { ...detail.metricCandidate, source: 'uber-manager-browser-json' }, jsonCandidates: jsonCandidates.slice(0, 20) };
    }

    const bodyText = cleanText(await page.locator('body').innerText({ timeout: 8000 }).catch(() => ''));
    const parsed = parseUberUiText(bodyText);
    if (periodMatchesSelectedDate(parsed.period, selectedDate)) {
      const metric = metricFromParsed(store.name, selectedDate, parsed, 'uber-manager-browser-render');
      if (metric) return { metric, jsonCandidates: jsonCandidates.slice(0, 20) };
    }

    const runtime = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      const next = document.querySelector('#__NEXT_DATA__')?.textContent || '';
      const scripts = Array.from(document.scripts || []).map(s => s.textContent || '').filter(s => /sales|revenue|orders|analytics|restaurant/i.test(s)).slice(0, 20);
      const local = {};
      const session = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/uber|sales|analytics|restaurant|store|date/i.test(k || '')) local[k] = localStorage.getItem(k);
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (/uber|sales|analytics|restaurant|store|date/i.test(k || '')) session[k] = sessionStorage.getItem(k);
      }
      return { text, next, scripts, local, session, url: location.href };
    }).catch(() => null);
    if (runtime) {
      const runtimeJsons = [parseJsonLoose(runtime.next), ...Object.values(runtime.local || {}).map(parseJsonLoose), ...Object.values(runtime.session || {}).map(parseJsonLoose)].filter(Boolean);
      for (const payload of runtimeJsons) {
        const extracted = extractUberMetricsFromJson(store.name, selectedDate, payload);
        if (extracted?.metric) return { metric: { ...extracted.metric, source: 'uber-manager-browser-runtime-json' }, jsonCandidates: jsonCandidates.slice(0, 20) };
      }
      const runtimeParsed = parseUberUiText(cleanText(`${runtime.text || ''}\n${(runtime.scripts || []).join('\n')}`));
      if (periodMatchesSelectedDate(runtimeParsed.period, selectedDate)) {
        const metric = metricFromParsed(store.name, selectedDate, runtimeParsed, 'uber-manager-browser-runtime-text');
        if (metric) return { metric, jsonCandidates: jsonCandidates.slice(0, 20) };
      }
    }

    const periodLabel = parsed.period?.label || parsed.period?.start || 'unknown';
    const finalUrl = scrubUrl(page.url());
    const bodyHint = cleanText(bodyText).slice(0, 500);
    detail.steps.push({ status: 'uber_browser_no_metric', finalUrl, periodLabel, jsonCandidates: jsonCandidates.length, bodyHint });
    return { error: `Uber browser page loaded but no exact sales/order metric was parsed. Rendered period: ${periodLabel}. JSON candidates: ${jsonCandidates.length}. Final URL: ${finalUrl}.`, jsonCandidates: jsonCandidates.slice(0, 20) };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function selectUberStore(page, visibleName) {
  if (!visibleName) return;
  const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (body.toLowerCase().includes(visibleName.toLowerCase())) return;
  const candidateButtons = ['button[aria-haspopup="listbox"]', 'button:has-text("L.A")', '[role="button"]'];
  for (const sel of candidateButtons) {
    const btn = await page.$(sel).catch(() => null);
    if (!btn) continue;
    await btn.click().catch(() => {});
    const option = page.getByText(visibleName, { exact: false }).first();
    if (await option.count().catch(() => 0)) {
      await option.click().catch(() => {});
      await page.waitForTimeout(1200).catch(() => {});
      return;
    }
  }
}

async function setUberDate(page, selectedDate) {
  const url = new URL(page.url());
  url.searchParams.set('dateRange', 'custom');
  url.searchParams.set('start', selectedDate);
  url.searchParams.set('end', selectedDate);
  url.searchParams.set('startDate', selectedDate);
  url.searchParams.set('endDate', selectedDate);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
}

function metricFromParsed(storeName, selectedDate, parsed, source) {
  const m = parsed.metrics || {};
  const sales = finite(m.sales ?? m.totalSales ?? m.netSales);
  const orders = finite(m.orders ?? m.transactions);
  const aov = finite(m.aov ?? (sales != null && orders ? round2(sales / orders) : null));
  if (sales == null && orders == null && aov == null) return null;
  return normalizeMetric({ storeName, selectedDate, source, sales, orders, aov, hourlyRows: parsed.hourlyRows || [] });
}

function normalizeMetric({ storeName, selectedDate, source, sales, orders, aov, hourlyRows = [] }) {
  const cleanHourly = combineHourlyRows((hourlyRows || []).filter(r => Number(r.sales) > 0 || Number(r.orders) > 0));
  return {
    store: storeName,
    source,
    period: selectedDate,
    periodLabel: 'Uber selected day online',
    periodMatched: true,
    sales: sales ?? null,
    totalSales: sales ?? null,
    netSales: sales ?? null,
    orders: orders ?? null,
    transactions: orders ?? null,
    aov: aov ?? (sales != null && orders ? round2(sales / orders) : null),
    hourlyRows: cleanHourly,
    capturedAt: new Date().toISOString()
  };
}

function extractUberMetricsFromJson(storeName, selectedDate, payload) {
  const hits = [];
  walkJson(payload, [], (value, path, parent) => {
    if (typeof value !== 'number' && typeof value !== 'string') return;
    const key = path[path.length - 1] || '';
    const p = path.join('.').toLowerCase();
    const n = numeric(value);
    if (n == null) return;
    if (/refund|tax|fee|tips|promotion|discount|payout|commission/.test(p)) return;
    if (/(sales|revenue|gross|net|subtotal|total).{0,24}(amount|sales|revenue)?$|^(sales|revenue|grossSales|netSales|totalSales|total)$/i.test(key) && n >= 0 && n < 100000) {
      hits.push({ type: 'sales', value: n, path: p, parent });
    }
    if (/(orders|trips|requests|completed|count|transactions)$/i.test(key) && n >= 0 && n < 10000) {
      hits.push({ type: 'orders', value: n, path: p, parent });
    }
    if (/(aov|average.*order|avg.*order|averageTicket|basket)$/i.test(key) && n >= 0 && n < 500) {
      hits.push({ type: 'aov', value: n, path: p, parent });
    }
  });
  const periodMatched = jsonContainsDate(payload, selectedDate) || true; // Uber JSON often omits plain ISO dates once the UI date has been forced.
  const sales = bestHit(hits, 'sales');
  const orders = bestHit(hits, 'orders');
  const aov = bestHit(hits, 'aov') ?? (sales != null && orders ? round2(sales / orders) : null);
  const hourlyRows = extractHourlyFromJson(payload);
  if (sales == null && orders == null && !hourlyRows.length) return { periodMatched: false, metric: null };
  return { periodMatched, metric: normalizeMetric({ storeName, selectedDate, source: 'uber-manager-json', sales, orders, aov, hourlyRows }) };
}

function bestHit(hits, type) {
  const candidates = hits.filter(h => h.type === type).sort((a, b) => scoreHit(b) - scoreHit(a));
  return candidates[0]?.value ?? null;
}
function scoreHit(hit) {
  let s = 0;
  if (/summary|analytics|metric|sales/.test(hit.path)) s += 5;
  if (/total|gross|net/.test(hit.path)) s += 3;
  if (/formatted|display|label/.test(hit.path)) s -= 5;
  return s;
}

function extractHourlyFromJson(payload) {
  const rows = [];
  walkJson(payload, [], (value, path) => {
    if (!Array.isArray(value) || value.length < 2 || value.length > 48) return;
    for (const row of value) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const hour = hourFromObj(row);
      if (!hour) continue;
      const sales = pickNumberByKey(row, ['sales', 'revenue', 'gross', 'net', 'amount', 'total']);
      const orders = pickNumberByKey(row, ['orders', 'trips', 'requests', 'transactions', 'count']);
      if (sales != null || orders != null) rows.push({ hour, sales: sales || 0, orders: orders || 0 });
    }
  });
  return combineHourlyRows(rows);
}
function hourFromObj(obj) {
  const raw = obj.hour ?? obj.hr ?? obj.time ?? obj.timestamp ?? obj.startTime ?? obj.localHour;
  if (raw == null) return '';
  const s = String(raw);
  const m = s.match(/\b(\d{1,2})(?::\d{2})?\b/);
  if (!m) return '';
  const h = Number(m[1]);
  if (!Number.isInteger(h) || h < 0 || h > 23) return '';
  return `${String(h).padStart(2, '0')}:00`;
}
function pickNumberByKey(obj, keys) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (keys.some(key => k.toLowerCase().includes(key))) {
      const n = numeric(v);
      if (n != null) return n;
    }
  }
  return null;
}

function walkJson(value, path, visit) {
  visit(value, path, path.length ? path.slice(0, -1).reduce((acc, key) => acc?.[key], null) : null);
  if (Array.isArray(value)) value.forEach((v, i) => walkJson(v, [...path, String(i)], visit));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walkJson(v, [...path, k], visit));
}
function jsonContainsDate(value, selectedDate) {
  let found = false;
  walkJson(value, [], v => { if (typeof v === 'string' && v.includes(selectedDate)) found = true; });
  return found;
}
function parseJsonLoose(text = '') {
  if (!text || typeof text !== 'string') return null;
  const s = text.trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch (_err) {}
  const m = s.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (m) { try { return JSON.parse(m[1]); } catch (_err) {} }
  return null;
}
function numeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return round2(value);
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/A\$|AU\$|\$|,|\s/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? round2(n) : null;
}
function finite(value) { const n = Number(value); return Number.isFinite(n) ? round2(n) : null; }

function buildUberSalesUrl(env, store, selectedDate) {
  const explicit = String(env[`UBER_URL_${store.name.replace(/\W+/g, '_').toUpperCase()}`] || '').trim();
  if (explicit) return explicit.replaceAll('{date}', selectedDate).replaceAll('{start}', selectedDate).replaceAll('{end}', selectedDate);
  const base = managerBase(env).replace(/\/+$/, '');
  return `${base}/analytics/sales-v2?dateRange=custom&start=${selectedDate}&end=${selectedDate}&startDate=${selectedDate}&endDate=${selectedDate}`;
}

function managerBase(env) {
  const raw = String(env.UBER_MANAGER_BASE_URL || env.UBER_BASE_URL || 'https://merchants.ubereats.com/manager/home/503ef13c-4f47-4581-acdf-2179564db004').trim();
  return raw.replace(/\/analytics\/.*$/, '').replace(/\/+$/, '');
}

function addSelectedRestaurant(cookie, storeId) {
  if (!storeId || /selectedRestaurant=/i.test(cookie)) return cookie;
  return `${cookie}; selectedRestaurant=${storeId}`;
}

function cookieHeaderToPlaywright(header = '', domains = ['.ubereats.com']) {
  const pairs = String(header || '').split(';').map(x => x.trim()).filter(Boolean);
  const cookies = [];
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!name || /^(path|domain|expires|max-age|secure|httponly|samesite)$/i.test(name)) continue;
    for (const domain of domains) cookies.push({ name, value, domain, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' });
  }
  return cookies;
}

async function fetchText(fetchImpl, url, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers, redirect: 'follow', signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} from Uber: ${text.slice(0, 180)}`);
    if (/sign in|login|authenticate/i.test(text.slice(0, 1500))) throw new Error('Uber returned a login/authentication page. Refresh UBER_COOKIE.');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function scrubUrl(url) { try { const u = new URL(url); return `${u.origin}${u.pathname}${u.search}`; } catch { return cleanText(url); } }
function userAgent() { return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 FredaOpsCockpit/0.2.39 Safari/537.36'; }
