import fs from 'fs';
import path from 'path';
import { currentDateInTimeZone, normalizeReportingDate } from './utils/dateUtils.js';
import { makeId } from './utils/safe.js';
import { DEFAULT_SHAPE_MAP, normaliseShapeMap } from './services/productionMix.js';

export function readJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return clone(fallback);
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return clone(fallback);
    return JSON.parse(raw);
  } catch (err) {
    return { ...clone(fallback), readError: String(err?.message || err) };
  }
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  return value;
}

export function emptyLiveState() {
  return {
    version: '0.2.40',
    reportingDate: currentDateInTimeZone('Australia/Sydney'),
    updatedAt: null,
    reportingPOS: {},
    // POS sync is the operational source of truth from 0.2.24 onward.
    // Uploaded POS Excel/CSV remains available only as backup/history.
    posSyncByStoreDate: {},
    uberEats: {},
    square: {},
    staleExternalSources: { uberEats: {}, square: {} },
    connectorStatus: {},
    syncRuns: [],
    captures: [],
    whatsapp: { summaries: [], actions: [] },
    ticketRowsByStore: {},
    posTicketWatermarks: {},
    productionShapeMap: DEFAULT_SHAPE_MAP,
    hourlyHistory: {},
    sellOutPlans: {},
    candidates: seedCandidates(),
    training: seedTraining(),
    audits: seedAudits(),
    actions: [],
    importStatus: {},
    productionPlan: {},
    weeklySummary: {},
    fileImportCache: {}
  };
}

export function mergeLive(seed = {}, live = {}) {
  const reportingDate = normalizeReportingDate(live.reportingDate || seed.reportingDate, 'Australia/Sydney');
  const theoreticalExternal = buildTheoreticalExternalSources(live, reportingDate);
  let merged = {
    ...(seed || {}),
    liveVersion: live.version || '0.2.30',
    version: '0.2.40',
    reportingDate,
    updatedAt: live.updatedAt || seed.generatedAt || null,
    stores: seed.stores || defaultStores(),
    fredaFeedbackPriorities: seed.fredaFeedbackPriorities || [],
    reportingPOS: sameDayPosMap(live, reportingDate),
    uberEats: { ...theoreticalExternal.uberEats, ...sameDayMap(live.uberEats, reportingDate) },
    square: { ...theoreticalExternal.square, ...sameDayMap(live.square, reportingDate) },
    theoreticalExternalSources: theoreticalExternal,
    staleExternalSources: {
      uberEats: staleMap(live.uberEats, reportingDate),
      square: staleMap(live.square, reportingDate)
    },
    referenceExternalSources: {
      uberEats: { ...(seed.sampleMetrics?.uberEats || {}), ...staleMap(live.uberEats, reportingDate) },
      square: { ...(seed.sampleMetrics?.square || {}), ...staleMap(live.square, reportingDate) }
    },
    connectorStatus: live.connectorStatus || {},
    syncRuns: live.syncRuns || [],
    captures: live.captures || [],
    whatsapp: live.whatsapp || { summaries: [], actions: [] },
    ticketRowsByStore: live.ticketRowsByStore || {},
    posTicketWatermarks: live.posTicketWatermarks || {},
    productionShapeMap: normaliseShapeMap(live.productionShapeMap || seed.productRules?.shapeMap || DEFAULT_SHAPE_MAP),
    hourlyHistory: live.hourlyHistory || seed.hourlyHistory || {},
    sellOutPlans: live.sellOutPlans || seed.sellOutPlans || {},
    candidates: live.candidates?.length ? live.candidates : seedCandidates(),
    training: live.training || seedTraining(),
    audits: live.audits || seedAudits(),
    actions: live.actions || [],
    importStatus: live.importStatus || seed.importStatus || {},
    productionPlan: live.productionPlan || seed.productionPlan || {},
    weeklySummary: live.weeklySummary || seed.weeklySummary || {},
    fileImportCache: live.fileImportCache || seed.fileImportCache || {},
    posSyncByStoreDate: live.posSyncByStoreDate || seed.posSyncByStoreDate || {},
    uberSyncByStoreDate: live.uberSyncByStoreDate || seed.uberSyncByStoreDate || {}
  };
  merged.weeklySummary = buildLiveAwareWeeklySummary(merged);
  return merged;
}

export function applySyncResult(state, result) {
  let next = { ...state, version: '0.2.40', reportingDate: result.reportingDate || state.reportingDate, updatedAt: new Date().toISOString() };
  const isFileImport = result.source === 'File imports' || String(result.mode || '').includes('file-import');
  const isReportingSite = result.source === 'reporting.site' || String(result.mode || '').includes('reporting-site');

  if (result.reportingPOS) {
    if (isReportingSite) {
      next.reportingPOS = { ...(next.reportingPOS || {}), ...result.reportingPOS };
      next.posSyncByStoreDate = storePosByDate(next.posSyncByStoreDate || {}, result.reportingPOS, result.reportingDate || next.reportingDate);
    } else if (!isFileImport) {
      next.reportingPOS = { ...(next.reportingPOS || {}), ...result.reportingPOS };
    }
    // File-import POS rows are intentionally not promoted to reportingPOS in 0.2.24.
    // They remain available through fileImportCache as backup only.
  }
  if (result.uberEats) {
    next.uberEats = { ...(next.uberEats || {}), ...result.uberEats };
    next.uberSyncByStoreDate = storeUberByDate(next.uberSyncByStoreDate || {}, result.uberEats, result.reportingDate || next.reportingDate);
  }
  if (result.square) next.square = { ...(next.square || {}), ...result.square };
  if (result.ticketRowsByStore) next.ticketRowsByStore = { ...(next.ticketRowsByStore || {}), ...result.ticketRowsByStore };

  if (result.hourlyHistory) next.hourlyHistory = { ...(next.hourlyHistory || {}), ...result.hourlyHistory };
  if (result.productionPlan) next.productionPlan = result.productionPlan;
  if (result.weeklySummary) next.weeklySummary = result.weeklySummary;
  if (result.importStatus) next.importStatus = result.importStatus;
  if (result.fileImportCache) next.fileImportCache = result.fileImportCache;
  next.connectorStatus = { ...(next.connectorStatus || {}) };
  if (isReportingSite) next.connectorStatus.reportingSite = statusFromResult(result);
  if (isFileImport) next.connectorStatus.fileImports = statusFromResult(result);
  if (result.source === 'Uber Eats Manager' || result.mode?.includes('uber')) next.connectorStatus.uberEats = statusFromResult(result);
  if (result.source === 'Square API' || result.mode?.includes('square')) next.connectorStatus.square = statusFromResult(result);
  if (result.fileImports) next = applySyncResult(next, result.fileImports);
  if (result.pos) next = applySyncResult(next, result.pos);
  if (result.uber) next = applySyncResult(next, result.uber);
  if (result.square && result.square.source === 'Square API') next = applySyncResult(next, result.square);
  next.syncRuns = [{ id: makeId('sync'), source: result.source || result.mode || 'sync', status: result.status, ok: result.ok, reportingDate: result.reportingDate, startedAt: result.startedAt, finishedAt: result.finishedAt || new Date().toISOString(), errors: result.errors || [], warnings: result.warnings || [], details: result.details || [] }, ...(next.syncRuns || [])].slice(0, 80);
  return next;
}

export function addCapture(state, capture) {
  return { ...state, updatedAt: new Date().toISOString(), captures: [{ id: makeId('cap'), capturedAt: new Date().toISOString(), ...capture }, ...(state.captures || [])].slice(0, 100) };
}

export function addWhatsapp(state, syncResult) {
  return {
    ...state,
    updatedAt: new Date().toISOString(),
    whatsapp: {
      summaries: [syncResult.summary, ...(state.whatsapp?.summaries || [])].filter(Boolean).slice(0, 20),
      actions: [...(syncResult.actions || []), ...(state.whatsapp?.actions || [])].slice(0, 120)
    }
  };
}

export function saveShapeMap(state, rows = []) {
  return { ...state, updatedAt: new Date().toISOString(), productionShapeMap: normaliseShapeMap(rows) };
}

export function addCandidate(state, body = {}) {
  const candidate = scoreCandidate({ id: makeId('cand'), createdAt: new Date().toISOString(), ...body });
  return { ...state, updatedAt: new Date().toISOString(), candidates: [candidate, ...(state.candidates || [])] };
}

export function addTrainingCompletion(state, body = {}) {
  const completion = { id: makeId('train'), completedAt: new Date().toISOString(), staffName: body.staffName || 'Staff', moduleId: body.moduleId || 'sop', score: Number(body.score || 0), managerSignoff: Boolean(body.managerSignoff) };
  return { ...state, updatedAt: new Date().toISOString(), training: { ...(state.training || seedTraining()), completions: [completion, ...((state.training || {}).completions || [])] } };
}

export function addAudit(state, body = {}) {
  const score = Math.max(1, Math.min(10, Number(body.score || 5)));
  const status = score >= 8 ? 'Green' : score >= 5 ? 'Amber' : 'Red';
  const audit = { id: makeId('audit'), createdAt: new Date().toISOString(), store: body.store || 'Unknown', type: body.type || 'opening', zone: body.zone || 'cabinet', score, status, comment: body.comment || 'Manager review required. AI photo scoring placeholder until vision configured.' };
  return { ...state, updatedAt: new Date().toISOString(), audits: { ...(state.audits || seedAudits()), records: [audit, ...((state.audits || {}).records || [])] } };
}


function buildLiveAwareWeeklySummary(live = {}) {
  const reportingDate = normalizeReportingDate(live.reportingDate || currentDateInTimeZone('Australia/Sydney'), 'Australia/Sydney');
  const weekStart = mondayOf(reportingDate);
  const dates = dateRange(weekStart, reportingDate);
  const livePosByStoreDate = clone(live.posSyncByStoreDate || {});
  const backupPosByStoreDate = clone(live.fileImportCache?.hourlyByStoreDate || {});
  const fileUberByStoreDate = clone(live.fileImportCache?.uberByStoreDate || {});
  const liveUberByStoreDate = clone(live.uberSyncByStoreDate || {});
  const uberByStoreDate = mergeByStoreDate(fileUberByStoreDate, liveUberByStoreDate);
  const squareByDate = clone(live.fileImportCache?.squareByDate || {});

  // Keep compatibility with latest same-day objects. The persisted by-date maps
  // remain the primary source because WTD needs multiple dates.
  for (const [store, pos] of Object.entries(live.reportingPOS || {})) {
    const period = normalizeReportingDate(pos?.period || pos?.reportingDate || reportingDate, 'Australia/Sydney');
    if (!dates.includes(period)) continue;
    livePosByStoreDate[store] = livePosByStoreDate[store] || {};
    if (!livePosByStoreDate[store][period]) livePosByStoreDate[store][period] = pos;
  }

  for (const [store, uber] of Object.entries(live.uberEats || {})) {
    const period = normalizeReportingDate(uber?.period || uber?.reportingDate || reportingDate, 'Australia/Sydney');
    if (!dates.includes(period)) continue;
    const sales = firstFinite(uber, ['sales', 'totalSales', 'netSales']);
    if (!Number.isFinite(sales) || sales <= 0) continue;
    uberByStoreDate[store] = uberByStoreDate[store] || {};
    uberByStoreDate[store][period] = { ...(uberByStoreDate[store][period] || {}), ...uber, period, sales: roundMoney(sales), source: uber.source || 'live-uber' };
  }

  for (const [_store, sq] of Object.entries(live.square || {})) {
    const period = normalizeReportingDate(sq?.period || sq?.reportingDate || reportingDate, 'Australia/Sydney');
    if (!dates.includes(period)) continue;
    const sales = firstFinite(sq, ['sales', 'totalSales', 'netSales']);
    if (!Number.isFinite(sales) || sales <= 0) continue;
    squareByDate[period] = { ...(squareByDate[period] || {}), ...sq, period, sales: roundMoney(sales), source: sq.source || 'live-square-or-frieda' };
  }

  const storeNames = new Set([
    'Beverly Hills',
    'Penrith',
    'Taren Point',
    ...Object.keys(livePosByStoreDate || {}),
    ...Object.keys(backupPosByStoreDate || {}),
    ...Object.keys(uberByStoreDate || {})
  ]);
  const rows = [];
  let posTotal = 0;
  let uberTotal = 0;
  let friedasTotal = 0;
  const theoreticalUber = {};
  const theoreticalFriedasByDate = {};

  for (const store of storeNames) {
    let posSales = 0;
    let uberSales = 0;
    const liveDates = [];
    const backupDates = [];
    const uberDates = [];
    const theoreticalUberDates = [];
    for (const d of dates) {
      const liveDay = livePosByStoreDate?.[store]?.[d];
      const liveSales = daySales(liveDay);
      if (Number.isFinite(liveSales) && liveSales > 0) {
        posSales += liveSales;
        liveDates.push(d);
      } else {
        const backupDay = backupPosByStoreDate?.[store]?.[d];
        const backupSales = daySales(backupDay);
        if (Number.isFinite(backupSales) && backupSales > 0) {
          posSales += backupSales;
          backupDates.push(d);
        }
      }

      let uberDay = uberByStoreDate?.[store]?.[d];
      let uSales = daySales(uberDay);
      if (!Number.isFinite(uSales) || uSales <= 0) {
        uberDay = theoreticalUberForStoreDate(live, store, d);
        uSales = daySales(uberDay);
        if (Number.isFinite(uSales) && uSales > 0) {
          theoreticalUber[store] = theoreticalUber[store] || {};
          theoreticalUber[store][d] = uberDay;
          theoreticalUberDates.push(d);
        }
      } else {
        uberDates.push(d);
      }
      if (Number.isFinite(uSales) && uSales > 0) uberSales += uSales;
    }
    posSales = roundMoney(posSales);
    uberSales = roundMoney(uberSales);
    posTotal += posSales;
    uberTotal += uberSales;
    rows.push({
      store,
      posSales,
      uberSales,
      totalSales: roundMoney(posSales + uberSales),
      datesCovered: [...new Set([...liveDates, ...backupDates, ...uberDates, ...theoreticalUberDates])].sort(),
      livePosDates: liveDates,
      backupPosDates: backupDates,
      livePosIncluded: liveDates.includes(reportingDate),
      uberDates,
      theoreticalUberDates,
      uberSource: theoreticalUberDates.length ? 'actual-or-theoretical-fallback' : (uberDates.length ? 'actual-live-or-file' : 'not-available'),
      posSource: liveDates.length ? (backupDates.length ? 'live-pos-sync-plus-file-backup' : 'live-pos-sync') : (backupDates.length ? 'file-backup-only' : 'not-synced')
    });
  }

  const friedasDates = [];
  const theoreticalFriedasDates = [];
  for (const d of dates) {
    let day = squareByDate?.[d];
    let sales = daySales(day);
    if (!Number.isFinite(sales) || sales <= 0) {
      day = theoreticalFriedasForDate(live, d);
      sales = daySales(day);
      if (Number.isFinite(sales) && sales > 0) {
        theoreticalFriedasByDate[d] = day;
        theoreticalFriedasDates.push(d);
      }
    } else {
      friedasDates.push(d);
    }
    if (Number.isFinite(sales) && sales > 0) friedasTotal += sales;
  }

  const friedasMtd = friedasPeriodTotal(live, firstDayOfMonth(reportingDate), reportingDate);
  const prev = previousMonthRange(reportingDate);
  const friedasLastMonth = friedasPeriodTotal(live, prev.start, prev.end);

  const summary = {
    source: 'sync-first-pos-plus-uber-frieda-fallbacks',
    period: `${weekStart} to ${reportingDate}`,
    weekStart,
    weekEnd: reportingDate,
    dates,
    posTotal: roundMoney(posTotal),
    uberTotal: roundMoney(uberTotal),
    friedasTotal: roundMoney(friedasTotal),
    combinedDonutTotal: roundMoney(posTotal + uberTotal),
    combinedAllTotal: roundMoney(posTotal + uberTotal + friedasTotal),
    friedasMtdSales: friedasMtd.sales,
    friedasLastMonthSales: friedasLastMonth.sales,
    friedasMtdDates: friedasMtd.datesCovered,
    friedasLastMonthDates: friedasLastMonth.datesCovered,
    stores: rows.sort((a, b) => a.store.localeCompare(b.store)),
    theoreticalFallbacks: {
      uberByStoreDate: theoreticalUber,
      friedasByDate: theoreticalFriedasByDate
    },
    friedas: {
      store: "Frieda's Pies",
      squareSales: roundMoney(friedasTotal),
      totalSales: roundMoney(friedasTotal),
      mtdSales: friedasMtd.sales,
      lastMonthSales: friedasLastMonth.sales,
      mtdDatesCovered: friedasMtd.datesCovered,
      lastMonthDatesCovered: friedasLastMonth.datesCovered,
      datesCovered: [...new Set([...friedasDates, ...theoreticalFriedasDates])].sort(),
      actualDates: friedasDates,
      theoreticalDates: theoreticalFriedasDates,
      source: theoreticalFriedasDates.length ? 'actual-or-theoretical-fallback' : (friedasDates.length ? 'actual-square-or-file' : 'not-available')
    },
    note: '0.2.40 source policy: POS reporting.site live sync remains primary. Uber/Square use online actual first, uploaded backup second, and theoretical fallback from last-4 same weekday plus last-4 WTD pattern when actual data is missing.'
  };
  return summary;
}

function buildTheoreticalExternalSources(live = {}, reportingDate) {
  const out = { uberEats: {}, square: {}, notes: [] };
  for (const store of ['Beverly Hills', 'Penrith', 'Taren Point']) {
    const actual = sameDayExternalFromMaps(live.uberSyncByStoreDate, live.fileImportCache?.uberByStoreDate, store, reportingDate);
    if (actual) {
      out.uberEats[store] = { ...actual, store, period: reportingDate, reportingDate, sourcePolicy: actual.sourcePolicy || actual.source || 'actual-uber-or-uploaded-backup' };
      continue;
    }
    const theoretical = theoreticalUberForStoreDate(live, store, reportingDate);
    if (theoretical) out.uberEats[store] = theoretical;
  }
  const actualSquare = live.square?.["Frieda's Pies"] && normalizeReportingDate(live.square["Frieda's Pies"].period || live.square["Frieda's Pies"].reportingDate || '', 'Australia/Sydney') === reportingDate
    ? live.square["Frieda's Pies"]
    : (live.fileImportCache?.squareByDate?.[reportingDate] ? squareMetricFromDay(live.fileImportCache.squareByDate[reportingDate], reportingDate, 'square-items-file-backup') : null);
  if (actualSquare) out.square["Frieda's Pies"] = actualSquare;
  else {
    const theoretical = theoreticalFriedasForDate(live, reportingDate);
    if (theoretical) out.square["Frieda's Pies"] = theoretical;
  }
  return out;
}

function sameDayExternalFromMaps(liveMap = {}, fileMap = {}, store, date) {
  const live = liveMap?.[store]?.[date];
  const liveSales = daySales(live);
  if (Number.isFinite(liveSales) && liveSales > 0) return { ...live, sales: roundMoney(liveSales), totalSales: roundMoney(liveSales), sourcePolicy: 'live-online-actual' };
  const file = fileMap?.[store]?.[date];
  const fileSales = daySales(file);
  if (Number.isFinite(fileSales) && fileSales > 0) return { ...file, sales: roundMoney(fileSales), totalSales: roundMoney(fileSales), sourcePolicy: 'uploaded-backup-actual' };
  return null;
}

function theoreticalUberForStoreDate(live = {}, store, date) {
  const history = { ...(live.fileImportCache?.uberByStoreDate?.[store] || {}), ...(live.uberSyncByStoreDate?.[store] || {}) };
  const estimate = theoreticalDailySales(history, date);
  if (!estimate || !Number.isFinite(estimate.sales) || estimate.sales <= 0) return null;
  const uplift = Number(process.env.UBER_THEORETICAL_UPLIFT_FACTOR || 1.35);
  const avgRsp = Number(process.env.UBER_THEORETICAL_AVG_RSP || 5.5);
  const hourlyRows = allocateTheoreticalByPosHourly(live, store, date, estimate.sales, { unitFactor: 1 / uplift, avgRsp, unitLabel: 'in-store-equivalent units' });
  const units = roundMoney((estimate.sales / uplift) / avgRsp);
  return {
    store,
    source: 'theoretical-uber-fallback',
    sourcePolicy: 'theoretical-not-actual',
    period: date,
    reportingDate: date,
    periodMatched: true,
    theoretical: true,
    estimated: true,
    sales: roundMoney(estimate.sales),
    totalSales: roundMoney(estimate.sales),
    netSales: roundMoney(estimate.sales),
    grossSales: null,
    orders: null,
    transactions: null,
    aov: null,
    estimatedUnits: units,
    unitCalculation: `Uber gross theoretical sales / ${uplift} / average in-store RSP ${avgRsp}`,
    hourlyRows,
    allocationMethod: hourlyRows.length ? 'allocated proportionally to POS hourly sales' : 'daily total only - no POS hourly shape available',
    fallbackFormula: estimate.formula,
    sameWeekdayDates: estimate.sameWeekdayDates,
    wtdReferenceDates: estimate.wtdReferenceDates,
    capturedAt: new Date().toISOString(),
    warnings: ['Theoretical Uber fallback: not actual Uber Manager data. Used only because selected-day online/uploaded Uber value was missing.']
  };
}

function theoreticalFriedasForDate(live = {}, date) {
  const history = live.fileImportCache?.squareByDate || {};
  const estimate = theoreticalDailySales(history, date);
  if (!estimate || !Number.isFinite(estimate.sales) || estimate.sales <= 0) return null;
  const hourlyRows = allocateFriedasHourlyFromHistory(history, date, estimate.sales);
  const avgRsp = Number(process.env.FRIEDA_THEORETICAL_AVG_RSP || 8.5);
  const units = roundMoney(estimate.sales / avgRsp);
  return {
    store: "Frieda's Pies",
    source: 'theoretical-friedas-square-fallback',
    sourcePolicy: 'theoretical-not-actual',
    period: date,
    reportingDate: date,
    periodMatched: true,
    theoretical: true,
    estimated: true,
    sales: roundMoney(estimate.sales),
    totalSales: roundMoney(estimate.sales),
    netSales: roundMoney(estimate.sales),
    grossSales: null,
    orders: null,
    transactions: null,
    aov: null,
    estimatedUnits: units,
    unitCalculation: `Frieda theoretical sales / default pie RSP ${avgRsp}`,
    hourlyRows,
    allocationMethod: hourlyRows.length ? 'allocated from Frieda historical same-weekday hourly pattern' : 'daily total only - no Frieda hourly history available',
    fallbackFormula: estimate.formula,
    sameWeekdayDates: estimate.sameWeekdayDates,
    wtdReferenceDates: estimate.wtdReferenceDates,
    capturedAt: new Date().toISOString(),
    warnings: ['Theoretical Frieda/Square fallback: not actual Square data. Used only because selected-day Square/uploaded value was missing.']
  };
}

function theoreticalDailySales(historyByDate = {}, targetDate) {
  const sameWeekdayDates = [-7, -14, -21, -28].map(offset => addDays(targetDate, offset));
  const sameWeekdayValues = sameWeekdayDates.map(d => daySales(historyByDate?.[d])).filter(v => Number.isFinite(v) && v > 0);
  const sameWeekdayAvg = avg(sameWeekdayValues);

  const targetWeekStart = mondayOf(targetDate);
  const daysIntoWeek = Math.max(0, daysBetween(targetWeekStart, targetDate));
  const wtdReferenceDates = [];
  const wtdDailyValues = [];
  for (const offset of [-7, -14, -21, -28]) {
    const refEnd = addDays(targetDate, offset);
    const refStart = addDays(mondayOf(targetDate), offset);
    let cur = refStart;
    while (cur <= refEnd && daysBetween(refStart, cur) <= daysIntoWeek) {
      wtdReferenceDates.push(cur);
      const val = daySales(historyByDate?.[cur]);
      if (Number.isFinite(val) && val > 0) wtdDailyValues.push(val);
      cur = addDays(cur, 1);
    }
  }
  const wtdDailyAvg = avg(wtdDailyValues);
  const parts = [sameWeekdayAvg, wtdDailyAvg].filter(v => Number.isFinite(v) && v > 0);
  if (!parts.length) return null;
  const sales = roundMoney(parts.reduce((a, b) => a + b, 0) / parts.length);
  return {
    sales,
    sameWeekdayAvg: roundMoney(sameWeekdayAvg || 0),
    wtdDailyAvg: roundMoney(wtdDailyAvg || 0),
    sameWeekdayDates: sameWeekdayDates.filter(d => Number.isFinite(daySales(historyByDate?.[d])) && daySales(historyByDate?.[d]) > 0),
    wtdReferenceDates: [...new Set(wtdReferenceDates.filter(d => Number.isFinite(daySales(historyByDate?.[d])) && daySales(historyByDate?.[d]) > 0))].sort(),
    formula: 'average( last-4 same weekday average, last-4 equivalent WTD daily average )'
  };
}

function allocateTheoreticalByPosHourly(live = {}, store, date, sales, opts = {}) {
  const day = live.posSyncByStoreDate?.[store]?.[date] || live.fileImportCache?.hourlyByStoreDate?.[store]?.[date] || live.reportingPOS?.[store];
  const rows = meaningfulHourlyRows(day?.hourlyRows || []);
  const posSales = daySales(day) || rows.reduce((sum, r) => sum + (Number(r.sales) || 0), 0);
  if (!rows.length || !Number.isFinite(posSales) || posSales <= 0) return [];
  const unitFactor = Number(opts.unitFactor || 1);
  const avgRsp = Number(opts.avgRsp || 1);
  return rows.map(r => {
    const hSales = roundMoney((Number(r.sales) || 0) / posSales * sales);
    return { hour: r.hour, sales: hSales, estimatedUnits: avgRsp ? roundMoney(hSales * unitFactor / avgRsp) : null, source: 'theoretical-sales-allocated-by-pos-hour-share' };
  }).filter(r => r.sales > 0);
}

function allocateFriedasHourlyFromHistory(history = {}, date, sales) {
  const sourceDates = [-7, -14, -21, -28].map(offset => addDays(date, offset));
  const hourTotals = new Map();
  for (const d of sourceDates) {
    for (const row of meaningfulHourlyRows(history?.[d]?.hourlyRows || [])) {
      hourTotals.set(row.hour, (hourTotals.get(row.hour) || 0) + (Number(row.sales) || 0));
    }
  }
  const total = [...hourTotals.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  return [...hourTotals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([hour, val]) => {
    const hSales = roundMoney(val / total * sales);
    return { hour, sales: hSales, estimatedUnits: roundMoney(hSales / Number(process.env.FRIEDA_THEORETICAL_AVG_RSP || 8.5)), source: 'theoretical-friedas-allocated-by-historical-hour-share' };
  }).filter(r => r.sales > 0);
}

function squareMetricFromDay(day = {}, date, source = 'square-items-file-backup') {
  const sales = daySales(day);
  if (!Number.isFinite(sales) || sales <= 0) return null;
  return {
    store: "Frieda's Pies",
    source,
    sourcePolicy: 'uploaded-backup-actual',
    period: date,
    reportingDate: date,
    periodMatched: true,
    sales: roundMoney(sales),
    totalSales: roundMoney(sales),
    netSales: roundMoney(sales),
    grossSales: roundMoney(day.grossSales || sales),
    orders: day.transactions?.size || day.transactions || null,
    transactions: day.transactions?.size || day.transactions || null,
    qty: roundMoney(day.qty || 0),
    hourlyRows: Array.isArray(day.hourlyRows) ? day.hourlyRows : mapToRows(day.hourlyMap),
    capturedAt: day.capturedAt || null
  };
}

function mapToRows(mapLike) {
  if (!mapLike || typeof mapLike.values !== 'function') return [];
  return [...mapLike.values()].map(r => ({ ...r, sales: roundMoney(r.sales), grossSales: roundMoney(r.grossSales), qty: roundMoney(r.qty), transactions: r.transactions?.size || r.transactions || null })).sort((a, b) => String(a.hour).localeCompare(String(b.hour)));
}

function friedasPeriodTotal(live = {}, start, end) {
  const dates = dateRange(start, end);
  const source = live.fileImportCache?.squareByDate || {};
  let sales = 0;
  const datesCovered = [];
  for (const d of dates) {
    let day = source?.[d];
    let value = daySales(day);
    if (!Number.isFinite(value) || value <= 0) {
      day = theoreticalFriedasForDate(live, d);
      value = daySales(day);
    }
    if (Number.isFinite(value) && value > 0) {
      sales += value;
      datesCovered.push(d);
    }
  }
  return { sales: roundMoney(sales), datesCovered };
}

function firstDayOfMonth(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function previousMonthRange(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function avg(values = []) {
  const nums = values.filter(v => Number.isFinite(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function daysBetween(start, end) {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function firstFinite(obj = {}, keys = []) {
  for (const key of keys) {
    const n = Number(obj?.[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function roundMoney(value) { return Math.round((Number(value) || 0) * 100) / 100; }
function meaningfulHourlyRows(rows = []) {
  return (rows || []).filter(r => {
    const h = Number(String(r?.hour || '').slice(0, 2));
    const sales = Number(r?.sales);
    return Number.isInteger(h) && h >= 6 && h <= 23 && Number.isFinite(sales) && sales > 0;
  }).map(r => ({ ...r, sales: roundMoney(r.sales) }));
}
function mondayOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
function dateRange(start, end) {
  const out = [];
  let cur = start;
  while (cur <= end) { out.push(cur); cur = addDays(cur, 1); }
  return out;
}
function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}


function sameDayPosMap(live = {}, reportingDate) {
  const out = {};
  const byDate = live.posSyncByStoreDate || {};
  for (const [store, rowsByDate] of Object.entries(byDate || {})) {
    const hit = rowsByDate?.[reportingDate];
    if (hit) out[store] = { ...hit, sourcePolicy: 'live-pos-sync-primary' };
  }
  for (const [store, value] of Object.entries(sameDayMap(live.reportingPOS, reportingDate))) {
    if (!out[store]) out[store] = { ...value, sourcePolicy: 'live-pos-sync-primary' };
  }
  // Backup only: if no synced POS exists for the selected date, use uploaded
  // hourly workbook daily total as a transparent fallback, with no product rows.
  const backup = backupPosMapFromFileCache(live.fileImportCache, reportingDate);
  for (const [store, value] of Object.entries(backup)) {
    if (!out[store]) out[store] = value;
  }
  return out;
}

function backupPosMapFromFileCache(fileImportCache = {}, reportingDate) {
  const out = {};
  const byStore = fileImportCache?.hourlyByStoreDate || {};
  for (const [store, byDate] of Object.entries(byStore || {})) {
    const day = byDate?.[reportingDate];
    const sales = daySales(day);
    if (!Number.isFinite(sales) || sales <= 0) continue;
    out[store] = {
      store,
      source: 'pos-file-backup',
      sourcePolicy: 'backup-only-no-product-sales',
      sourceDetail: 'Uploaded POS hourly workbook backup. Live reporting.site sync remains the primary POS source.',
      period: reportingDate,
      periodMatched: true,
      sales: roundMoney(sales),
      totalSales: roundMoney(sales),
      netSales: roundMoney(sales),
      orders: null,
      transactions: null,
      aov: null,
      hourlyRows: meaningfulHourlyRows(day.hourlyRows || []),
      productRows: [],
      categoryRows: [],
      paymentRows: [],
      sourcePagesUsed: ['server/data/imports/pos/hourly backup'],
      warnings: ['Using uploaded POS hourly file as backup only. Product sales are not sourced from POS Excel/CSV in 0.2.24.'],
      capturedAt: day.capturedAt || fileImportCache.generatedAt || null
    };
  }
  return out;
}

function storePosByDate(existing = {}, reportingPOS = {}, fallbackDate) {
  const out = clone(existing || {});
  for (const [store, pos] of Object.entries(reportingPOS || {})) {
    const period = normalizeReportingDate(pos?.period || pos?.reportingDate || fallbackDate, 'Australia/Sydney');
    if (!period) continue;
    out[store] = out[store] || {};
    out[store][period] = { ...pos, period, reportingDate: period, sourcePolicy: 'live-pos-sync-primary' };
  }
  return out;
}

function storeUberByDate(existing = {}, uberEats = {}, fallbackDate) {
  const out = clone(existing || {});
  for (const [store, uber] of Object.entries(uberEats || {})) {
    const period = normalizeReportingDate(uber?.period || uber?.reportingDate || fallbackDate, 'Australia/Sydney');
    const sales = firstFinite(uber, ['sales', 'totalSales', 'netSales']);
    if (!period || !Number.isFinite(sales)) continue;
    out[store] = out[store] || {};
    out[store][period] = { ...uber, period, reportingDate: period, sales: roundMoney(sales), sourcePolicy: 'live-uber-online-primary' };
  }
  return out;
}

function mergeByStoreDate(backup = {}, live = {}) {
  const out = clone(backup || {});
  for (const [store, byDate] of Object.entries(live || {})) {
    out[store] = out[store] || {};
    for (const [date, value] of Object.entries(byDate || {})) out[store][date] = { ...(out[store][date] || {}), ...value, sourcePolicy: 'live-uber-online-primary' };
  }
  return out;
}

function daySales(day = {}) {
  const n = firstFinite(day, ['sales', 'totalSales', 'netSales']);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

function statusFromResult(result = {}) {
  const errors = uniqueStrings(result.errors || []);
  const warnings = uniqueStrings(result.warnings || []);
  return { ok: Boolean(result.ok), status: result.status || (result.ok ? 'success' : 'failed'), mode: result.mode, source: result.source, reportingDate: result.reportingDate, periodMatched: Boolean(result.periodMatched), lastSync: result.finishedAt || new Date().toISOString(), error: errors.join(' | ') || null, warnings, details: result.details || [] };
}
function uniqueStrings(values = []) {
  return [...new Set((values || []).filter(Boolean).map(x => String(x)).filter(Boolean))];
}

function sameDayMap(source = {}, reportingDate) {
  const out = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (!value) continue;
    const period = normalizeReportingDate(value.period || value.reportingDate || '', 'Australia/Sydney');
    if (period === reportingDate) out[key] = value;
  }
  return out;
}

function staleMap(source = {}, reportingDate) {
  const out = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (!value) continue;
    const raw = value.period || value.reportingDate || '';
    const period = raw ? normalizeReportingDate(raw, 'Australia/Sydney') : '';
    if (period !== reportingDate) out[key] = { period: value.period || null, periodLabel: value.periodLabel || value.period || null, source: value.source || null, capturedAt: value.capturedAt || null, sales: value.sales || value.totalSales || value.netSales || null, transactions: value.transactions || value.orders || null, reason: `Ignored for daily cards because period is not ${reportingDate}` };
  }
  return out;
}

function scoreCandidate(candidate) {
  const text = `${candidate.availability || ''} ${candidate.transport || ''} ${candidate.experience || ''} ${candidate.answers || ''}`.toLowerCase();
  let score = 50;
  const flags = [];
  if (/fri|friday|sat|saturday|weekend/.test(text)) score += 20; else flags.push('Cannot confirm Friday/Saturday peak availability.');
  if (/car|drive|own transport|near|walk|bus/.test(text)) score += 15; else flags.push('Transport/distance needs checking.');
  if (/food|cafe|retail|customer|barista|kitchen/.test(text)) score += 15; else flags.push('Limited food/customer-service experience.');
  if (/quit|short|few weeks/.test(text)) { score -= 15; flags.push('Possible short-tenure risk.'); }
  const recommendation = score >= 80 ? 'Hire' : score >= 60 ? 'Maybe' : 'Pass';
  return { ...candidate, score: Math.max(0, Math.min(100, score)), recommendation, riskFlags: flags, interviewQuestions: ['Can you reliably work Friday/Saturday peaks?', 'How would you handle a customer complaint during a rush?', 'Which store can you get to fastest and how?'] };
}

function seedCandidates() { return [scoreCandidate({ id: 'sample_candidate_1', name: 'Sample strong weekend candidate', store: 'Penrith', availability: 'Friday Saturday Sunday', transport: 'Own car', experience: 'Cafe and customer service', answers: 'Likes fast-paced work' })]; }
function seedTraining() { return { modules: [
  { id: 'food-safety', title: 'Food safety and hygiene', steps: ['Wash hands before production and service.', 'Keep raw/finished areas separate.', 'Escalate any food safety concern to manager.'] },
  { id: 'cabinet', title: 'Cabinet presentation', steps: ['Keep display full and neat.', 'Group like products.', 'Face labels forward.', 'Escalate gaps before peak.'] },
  { id: 'upsell', title: 'Upsell and AOV', steps: ['Offer 6-pack or box.', 'Suggest drink combo.', 'Use one short friendly sentence.'] },
  { id: 'thickshake', title: 'Milkshake / thickshake', steps: ['Confirm flavour.', 'Use correct scoop count.', 'Blend to standard texture.', 'Wipe cup and hand over cleanly.'] }
], completions: [] }; }
function seedAudits() { return { records: [], zones: ['Cabinet and display', 'Front-of-house cleanliness', 'Production area', 'Beverage station', 'Signage and pricing'] }; }
function defaultStores() { return ['Beverly Hills', 'Penrith', 'Taren Point', "Frieda's Pies"].map(name => ({ name, status: 'Amber' })); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
