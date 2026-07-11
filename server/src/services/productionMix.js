import { round2 } from '../utils/safe.js';

export const SHAPES = ['RING', 'BALL', 'LONG', 'SCROLL', 'APPLE', 'OTHER'];

// Protected SKU rules. Specific names must be matched before generic names.
export const PROTECTED_SKUS = [
  { canonical: 'Vanilla Slice', aliases: ['VANILLA SLICE'], expectedStores: ['Beverly Hills', 'Penrith', 'Taren Point'] },
  { canonical: 'Strawberry Nutella', aliases: ['STRAWBERRY NUTELLA', 'STRAWBERRY NUTELLA CREAM'], expectedStores: ['Beverly Hills', 'Penrith', 'Taren Point'] },
  { canonical: 'Caramel', aliases: ['CARAMEL', 'CARAMEL ICED'], expectedStores: ['Beverly Hills', 'Penrith', 'Taren Point'] }
];

// V40 protected map. BALL should normally remain around 30% to 35% of production.
export const DEFAULT_SHAPE_MAP = [
  ['Strawberry Nutella', 'RING', ['STRAWBERRY NUTELLA CREAM']],
  ['Vanilla Slice', 'RING', ['VANILLA SLICE']],
  ['Banana Custard', 'RING', ['BANANA CUSTARD', 'BANANA']],
  ['Boston Creme', 'RING', ['BOSTON CREME', 'BOSTON CREAM', 'BOSTON']],
  ['Lemon Filled', 'RING', ['LEMON FILLED', 'LEMON']],
  ['Raspberry Filled', 'RING', ['RASPBERRY FILLED', 'RASPBERRY']],
  ['Biscoff Cream', 'RING', ['BISCOFF CREAM']],
  ['Creme Brulee', 'RING', ['CREME BRUILEE', 'CREME BRULEE', 'BRULEE']],
  ['Gaytime', 'RING', ['GAYTIME']],
  ['M&M', 'RING', ['MNMS', 'M&M', 'MMS']],
  ['Nutella Biscoff', 'RING', ['NUTELLA BISCOFF']],
  ['Nutella', 'RING', ['NUTELLA']],
  ['Oreo Cookies n Cream', 'RING', ['OREO COOKIES N CREAM', 'OREO']],
  ['Snickers', 'RING', ['SNICKERS']],
  ['Specials Total', 'RING', ['SPECIAL', 'SPECIALS']],
  ['Homer', 'BALL', ['HOMER']],
  ['Glaze', 'BALL', ['GLAZED', 'GLAZE']],
  ['Chocolate Iced', 'BALL', ['CHOCOLATE ICED', 'CHOC ICED', 'CHOC']],
  ['Cinnamon', 'BALL', ['CINNAMON']],
  ['Caramel', 'BALL', ['CARAMEL ICED', 'CARAMEL']],
  ['Fairy Bread', 'BALL', ['FAIRY BREAD', 'FAIRY']],
  ['Passionfruit', 'BALL', ['PASSIONFRUIT', 'PASSION']],
  ['Pineapple', 'BALL', ['PINEAPPLE']],
  ['Cream Finger Bun', 'LONG', ['CREAM FINGER BUN', 'FINGER BUN']],
  ['Chocolate Eclair', 'LONG', ['CHOCOLATE ECLAIR', 'ECLAIR', 'ECLAIRS']],
  ['Cinnamon Scroll', 'SCROLL', ['CINNAMON SCROLL', 'SCROLL']],
  ['Apple Fritter', 'APPLE', ['APPLE FRITTER', 'APPLE']]
].map(([product, shape, aliases = []]) => ({ product, aliases, ...weightsForShape(shape) }));

export function normaliseShapeMap(shapeMap = DEFAULT_SHAPE_MAP) {
  return (shapeMap || []).filter(Boolean).map(row => {
    const explicit = normaliseShape(row.shape || row.Shape || row['Cook Shape']);
    const weights = explicit ? weightsForShape(explicit) : null;
    return {
      product: row.product || row.name || row.Product || 'Unknown',
      aliases: Array.isArray(row.aliases) ? row.aliases : [],
      ring: pct(weights?.ring ?? row.ring ?? row.RING),
      ball: pct(weights?.ball ?? row.ball ?? row.BALL),
      long: pct(weights?.long ?? row.long ?? row.LONG),
      scroll: pct(weights?.scroll ?? row.scroll ?? row.SCROLL),
      apple: pct(weights?.apple ?? row.apple ?? row.APPLE)
    };
  });
}

export function analyseProductionMix(live = {}) {
  const plan = live.productionPlan || {};
  const currentPlan = plan.current || legacyPlanAsCurrent(plan);
  const lastPlan = plan.last || null;
  const baseMap = normaliseShapeMap(live.productionShapeMap || live.productRules?.shapeMap || DEFAULT_SHAPE_MAP);
  const importedMap = shapeRowsToShapeMap([...(currentPlan?.shapeRows || []), ...(lastPlan?.shapeRows || []), ...(plan.shapeRows || [])]);
  const map = mergeShapeMaps(baseMap, importedMap);

  const salesRows = Object.values(live.reportingPOS || {}).flatMap(store => (store.productRows || []).map(row => ({ ...row, store: store.store })));
  const selectedDate = plan.planningDate || currentPlan?.planningDate || plan.selectedDate || live.reportingDate;
  const salesShapeModel = buildSalesShapeModel(salesRows, map);
  const currentSummary = buildPeriodSummary(currentPlan, map, selectedDate);
  const lastSummary = lastPlan ? buildPeriodSummary(lastPlan, map, lastPlan.planningDate || addDays(selectedDate, -7)) : null;
  const stockRisk = buildStockRisk(currentPlan, map, live, salesShapeModel, selectedDate);

  const protectedProducts = buildProtectedSkuCoverage(currentPlan?.selectedProductRows || [], salesRows, map);
  const protectedGaps = protectedProducts.filter(r => r.status === 'missing_from_plan_but_selling');

  const warnings = [...(plan.warnings || []), ...(currentPlan?.warnings || [])];
  if (lastPlan && lastPlan.source === 'missing') warnings.push('Last week production files missing: add last_cook.xlsx and last_prod.xlsx for week-over-week comparisons.');
  if (!lastPlan) warnings.push('Last week production model is not loaded. Add last_cook.xlsx and last_prod.xlsx to compare the same weekday last week.');
  if (currentSummary.weeklyBallShare != null && currentSummary.weeklyBallShare > 0.35) warnings.push(`BALL production share is ${round2(currentSummary.weeklyBallShare * 100)}%. Freda target is 30-35%; check product-to-shape mapping before increasing ball volume.`);
  if (salesShapeModel.unknownTotal > 0) warnings.push('Some POS product rows do not match the protected shape map. Categorise unmapped specials before relying on stock risk.');
  if (protectedGaps.length) warnings.push(`Protected SKU plan gap detected: ${protectedGaps.map(r => `${r.store} ${r.product}`).join(', ')}.`);
  if (!currentPlan?.selectedProductRows?.length && !currentPlan?.selectedCookRows?.length) warnings.push(`No current production rows loaded for selected date ${selectedDate}.`);

  return {
    shapeMap: map,
    totals: salesShapeModel.totals,
    ballShare: salesShapeModel.ballShare,
    warnings: uniqueStrings(warnings),
    drivers: salesShapeModel.drivers.slice(0, 40),
    protectedProducts,
    shapeSummary: currentSummary,
    lastShapeSummary: lastSummary,
    stockRisk,
    priorityMessages: stockRisk.priorityMessages,
    importedPlan: {
      source: plan.source || currentPlan?.source || 'none',
      weekStart: currentPlan?.weekStart || null,
      weekEnd: currentPlan?.weekEnd || null,
      selectedDate: plan.selectedDate || live.reportingDate,
      planningDate: currentPlan?.planningDate || selectedDate,
      fileChecklist: plan.fileChecklist || {},
      current: currentSummary,
      last: lastSummary,
      comparison: comparePeriods(currentSummary, lastSummary),
      storeTotals: currentPlan?.storeTotals || {},
      dayTotals: currentPlan?.dayTotals || {},
      shapeTotals: currentSummary.weeklyShapeTotals || {},
      dailyShapeTotals: currentSummary.dailyShapeTotals || {},
      selectedCookRows: currentPlan?.selectedCookRows || [],
      selectedProductRows: (currentPlan?.selectedProductRows || []).slice(0, 200),
      productShapeRows: currentSummary.dailyProductShapeRows || [],
      weeklyProductShapeRows: currentSummary.weeklyProductShapeRows || [],
      shapeRows: currentPlan?.shapeRows || []
    }
  };
}

function buildPeriodSummary(period = {}, map = [], selectedDate = '') {
  if (!period || period.source === 'missing') return null;
  const productRows = period.productRows || [];
  const cookRows = period.cookRows || [];
  const planningDate = period.planningDate || selectedDate;
  const selectedProducts = productRows.filter(r => r.date === planningDate);
  const selectedCook = cookRows.filter(r => r.date === planningDate);
  const weeklyProductShapeRows = productRowsToShapeRows(productRows, map);
  const dailyProductShapeRows = productRowsToShapeRows(selectedProducts, map);
  const weeklyShapeTotalsFromProducts = sumShapeRows(weeklyProductShapeRows);
  const dailyShapeTotalsFromProducts = sumShapeRows(dailyProductShapeRows);
  const weeklyShapeTotalsFromCook = groupCookShapeTotals(cookRows);
  const dailyShapeTotalsFromCook = groupCookShapeTotals(selectedCook);
  const weeklyShapeTotals = chooseShapeTotals(weeklyShapeTotalsFromProducts, weeklyShapeTotalsFromCook);
  const dailyShapeTotals = chooseShapeTotals(dailyShapeTotalsFromProducts, dailyShapeTotalsFromCook);
  const weeklyTotal = shapeTotal(weeklyShapeTotals);
  const dailyTotal = shapeTotal(dailyShapeTotals);
  return {
    source: period.source || 'production-cook-xlsx-import',
    files: period.files || [],
    weekStart: period.weekStart || null,
    weekEnd: period.weekEnd || null,
    planningDate,
    selectedDate,
    weeklyTotal,
    dailyTotal,
    weeklyShapeTotals,
    dailyShapeTotals,
    weeklyBallShare: weeklyTotal ? round2((weeklyShapeTotals.BALL || 0) / weeklyTotal) : null,
    dailyBallShare: dailyTotal ? round2((dailyShapeTotals.BALL || 0) / dailyTotal) : null,
    weeklyShapeDetail: buildShapeDetail(weeklyProductShapeRows, weeklyShapeTotals),
    dailyShapeDetail: buildShapeDetail(dailyProductShapeRows, dailyShapeTotals),
    weeklyProductShapeRows,
    dailyProductShapeRows,
    weeklyCookShapeTotals: weeklyShapeTotalsFromCook,
    dailyCookShapeTotals: dailyShapeTotalsFromCook,
    weeklyProductShapeTotals: weeklyShapeTotalsFromProducts,
    dailyProductShapeTotals: dailyShapeTotalsFromProducts,
    storeTotals: period.storeTotals || {},
    dayTotals: period.dayTotals || {},
    selectedCookRows: selectedCook,
    selectedProductRows: selectedProducts,
    unmappedRows: weeklyProductShapeRows.filter(r => r.shape === 'OTHER'),
    warnings: period.warnings || []
  };
}

function productRowsToShapeRows(rows = [], map = []) {
  const out = [];
  for (const row of rows || []) {
    const qty = Number(row.qty ?? row.totalPlan ?? row.totalCook ?? row.weeklyUnits ?? 0) || 0;
    if (!qty) continue;
    const explicitShape = normaliseShape(row.shape);
    const match = explicitShape ? { product: row.product || row.productName || row.productFamily || explicitShape, ...weightsForShape(explicitShape) } : findShapeMatch(row.productName || row.product || row.productFamily, map);
    if (!match) {
      out.push(makeShapeRow(row, 'OTHER', qty, 'unmapped', 0.25));
      continue;
    }
    for (const key of ['ring', 'ball', 'long', 'scroll', 'apple']) {
      const weight = Number(match[key]) || 0;
      if (weight > 0) out.push(makeShapeRow(row, key.toUpperCase(), qty * weight, match.product, weight >= 1 ? 1 : weight));
    }
  }
  return out;
}

function makeShapeRow(row, shape, qty, matchedProduct, confidence) {
  const product = row.productName || row.product || row.productFamily || matchedProduct || 'Unknown';
  return {
    date: row.date || '',
    weekStart: row.weekStart || '',
    weekEnd: row.weekEnd || '',
    day: row.day || '',
    store: cleanStore(row.store),
    productFamily: row.productFamily || canonicalFamily(product),
    productName: product,
    product,
    shape,
    qty: round2(qty),
    sourceFile: row.sourceFile || '',
    sourceSheet: row.sourceSheet || '',
    sourceRow: row.sourceRow || null,
    confidence: round2(confidence),
    matchedProduct
  };
}

function buildSalesShapeModel(salesRows = [], map = []) {
  const totals = emptyShapeTotalsLower();
  const drivers = [];
  let unknownTotal = 0;
  for (const row of salesRows || []) {
    const qty = Number(row.qty) || 0;
    const match = findShapeMatch(row.product, map);
    if (!match) {
      totals.unknown += qty;
      unknownTotal += qty;
      drivers.push({ product: row.product, qty: round2(qty), sales: round2(row.sales || 0), shape: 'unknown', store: row.store });
      continue;
    }
    const driver = { product: row.product, qty: round2(qty), sales: round2(row.sales || 0), store: row.store, matchedProduct: match.product };
    for (const shape of ['ring', 'ball', 'long', 'scroll', 'apple']) {
      const val = qty * (Number(match[shape]) || 0);
      totals[shape] += val;
      driver[shape] = round2(val);
    }
    drivers.push(driver);
  }
  const total = sumShapesLower(totals);
  return {
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
    ballShare: total ? round2(totals.ball / total) : null,
    unknownTotal: round2(unknownTotal),
    drivers: drivers.sort((a, b) => (b.qty || 0) - (a.qty || 0))
  };
}

function buildStockRisk(period = {}, map = [], live = {}, salesShapeModel = {}, selectedDate = '') {
  const productRows = period?.selectedProductRows || [];
  const cookRows = period?.selectedCookRows || [];
  const hasProduction = productRows.length || cookRows.length;
  const hasPosProducts = Object.values(live.reportingPOS || {}).some(pos => (pos.productRows || []).length);
  if (!hasProduction || !hasPosProducts) {
    return {
      rows: [],
      priorityMessages: [],
      dataGaps: [
        !hasProduction ? 'Current selected-date production/cook data is missing.' : '',
        !hasPosProducts ? 'POS product-level sales are missing; sync POS selected day/current + last days.' : ''
      ].filter(Boolean)
    };
  }

  const startByStoreShape = startingQtyByStoreShape(productRows, cookRows, map);
  const soldByStoreShape = soldQtyByStoreShape(live.reportingPOS || {}, map);
  const rows = [];
  for (const store of Object.keys(startByStoreShape).sort()) {
    for (const shape of SHAPES.filter(s => s !== 'OTHER')) {
      const startingQty = Number(startByStoreShape[store]?.[shape] || 0);
      if (!startingQty) continue;
      const soldEstimatedUnits = Number(soldByStoreShape[store]?.[shape] || 0);
      const remainingQty = round2(startingQty - soldEstimatedUnits);
      const rate = hourlyRunRate(live.reportingPOS?.[store], soldEstimatedUnits);
      const projectedSellOutTime = projectSellOutTime(live.reportingPOS?.[store], remainingQty, rate, selectedDate);
      const risk = classifyRisk(startingQty, remainingQty, projectedSellOutTime);
      const drivers = shapeDrivers(live.reportingPOS?.[store]?.productRows || [], map, shape).slice(0, 5);
      rows.push({
        store,
        shape,
        startingQty: round2(startingQty),
        soldEstimatedUnits: round2(soldEstimatedUnits),
        remainingQty,
        hourlyRunRate: rate,
        projectedSellOutTime,
        risk,
        drivingProducts: drivers,
        recommendation: recommendationFor(store, shape, risk, remainingQty, drivers)
      });
    }
  }
  const priorityMessages = rows
    .filter(r => r.risk === 'high' || r.risk === 'medium')
    .sort((a, b) => riskRank(b.risk) - riskRank(a.risk) || a.remainingQty - b.remainingQty)
    .slice(0, 5)
    .map(r => `${r.store} - ${r.risk.toUpperCase()} ${r.shape} shortage risk${r.projectedSellOutTime ? ` by ${r.projectedSellOutTime}` : ''}. ${r.drivingProducts?.length ? `${r.drivingProducts.map(x => x.product).join(', ')} are driving demand. ` : ''}${r.recommendation}`);
  return { rows, priorityMessages, dataGaps: [] };
}

function startingQtyByStoreShape(productRows = [], cookRows = [], map = []) {
  const out = {};
  const shapedProducts = productRowsToShapeRows(productRows, map);
  if (shapedProducts.length) {
    for (const row of shapedProducts) addNested(out, cleanStore(row.store), row.shape, row.qty);
    return out;
  }
  for (const row of cookRows || []) {
    const shape = normaliseShape(row.shape) || 'OTHER';
    addNested(out, cleanStore(row.store), shape, Number(row.totalCook || row.qty || 0) || 0);
  }
  return roundNested(out);
}

function soldQtyByStoreShape(reportingPOS = {}, map = []) {
  const out = {};
  for (const [storeName, pos] of Object.entries(reportingPOS || {})) {
    for (const row of pos.productRows || []) {
      const qty = Number(row.qty) || 0;
      const match = findShapeMatch(row.product, map);
      if (!match) addNested(out, cleanStore(pos.store || storeName), 'OTHER', qty);
      else for (const key of ['ring', 'ball', 'long', 'scroll', 'apple']) {
        const val = qty * (Number(match[key]) || 0);
        if (val) addNested(out, cleanStore(pos.store || storeName), key.toUpperCase(), val);
      }
    }
  }
  return roundNested(out);
}

function hourlyRunRate(pos = {}, soldUnits = 0) {
  const rows = (pos?.hourlyRows || []).filter(r => Number(r.sales || r.qty || 0) > 0);
  if (!rows.length || !soldUnits) return null;
  return round2(soldUnits / rows.length);
}

function projectSellOutTime(pos = {}, remainingQty = 0, rate = null, selectedDate = '') {
  if (remainingQty <= 0) return 'now';
  if (!rate || rate <= 0) return null;
  const hoursNeeded = remainingQty / rate;
  const rows = (pos?.hourlyRows || []).filter(r => Number(r.sales || r.qty || 0) > 0);
  const lastHour = rows.length ? hourNumber(rows[rows.length - 1].hour) + 1 : 10;
  const projectedHour = Math.min(23, lastHour + hoursNeeded);
  const hour = Math.floor(projectedHour);
  const minutes = Math.round((projectedHour - hour) * 60 / 5) * 5;
  return `${String(hour).padStart(2, '0')}:${String(minutes >= 60 ? 55 : minutes).padStart(2, '0')}`;
}

function classifyRisk(startingQty, remainingQty, projectedSellOutTime) {
  if (remainingQty <= 0) return 'high';
  const remainingShare = startingQty ? remainingQty / startingQty : 1;
  const hour = projectedSellOutTime ? hourNumber(projectedSellOutTime) : null;
  if (remainingShare <= 0.10 || (hour != null && hour <= 14)) return 'high';
  if (remainingShare <= 0.25 || (hour != null && hour <= 16)) return 'medium';
  return 'low';
}

function recommendationFor(store, shape, risk, remainingQty, drivers = []) {
  const driverText = drivers.length ? ` Check ${drivers.slice(0, 3).map(d => d.product).join(', ')}.` : '';
  if (risk === 'high') return `Prepare or reallocate ${Math.max(40, Math.ceil(Math.abs(remainingQty) / 10) * 10)}-${Math.max(80, Math.ceil((Math.abs(remainingQty) + 60) / 10) * 10)} ${shape} units.${driverText}`;
  if (risk === 'medium') return `Check ${shape} display depth before the next peak and prepare a smaller top-up if pace continues.${driverText}`;
  return `No immediate top-up needed; continue monitoring ${shape} pace.${driverText}`;
}

function shapeDrivers(productRows = [], map = [], shape = '') {
  return (productRows || []).map(row => {
    const match = findShapeMatch(row.product, map);
    const qty = Number(row.qty) || 0;
    const share = match ? Number(match[shape.toLowerCase()]) || 0 : (shape === 'OTHER' ? 1 : 0);
    return { product: row.product, qty: round2(qty * share), sales: round2(row.sales || 0) };
  }).filter(r => r.qty > 0).sort((a, b) => b.qty - a.qty);
}

function buildShapeDetail(shapeRows = [], fallbackTotals = {}) {
  const byShape = Object.fromEntries(SHAPES.map(shape => [shape, { shape, totalQty: 0, shareOfTotal: null, mappedProductFamilies: [], unmappedRows: [] }]));
  const productMaps = Object.fromEntries(SHAPES.map(shape => [shape, new Map()]));
  for (const row of shapeRows || []) {
    const shape = normaliseShape(row.shape) || 'OTHER';
    const qty = Number(row.qty) || 0;
    byShape[shape].totalQty += qty;
    const key = row.productFamily || row.productName || row.product || 'Unknown';
    const item = productMaps[shape].get(key) || { productFamily: key, qty: 0, stores: {}, sourceFiles: new Set() };
    item.qty += qty;
    if (row.store) item.stores[row.store] = round2((item.stores[row.store] || 0) + qty);
    if (row.sourceFile) item.sourceFiles.add(row.sourceFile);
    productMaps[shape].set(key, item);
    if (shape === 'OTHER') byShape[shape].unmappedRows.push(row);
  }
  for (const shape of SHAPES) {
    if (!byShape[shape].totalQty && fallbackTotals[shape]) byShape[shape].totalQty = Number(fallbackTotals[shape]) || 0;
  }
  const total = Object.values(byShape).reduce((s, x) => s + Number(x.totalQty || 0), 0);
  for (const shape of SHAPES) {
    byShape[shape].totalQty = round2(byShape[shape].totalQty);
    byShape[shape].shareOfTotal = total ? round2(byShape[shape].totalQty / total) : null;
    byShape[shape].mappedProductFamilies = [...productMaps[shape].values()].map(x => ({ ...x, qty: round2(x.qty), sourceFiles: [...x.sourceFiles] })).sort((a, b) => b.qty - a.qty);
  }
  return byShape;
}

function comparePeriods(current, last) {
  if (!current || !last) return { available: false, reason: 'last week files missing' };
  const shapes = Object.fromEntries(SHAPES.map(shape => {
    const cur = Number(current.weeklyShapeTotals?.[shape] || 0);
    const prev = Number(last.weeklyShapeTotals?.[shape] || 0);
    return [shape, { current: round2(cur), last: round2(prev), delta: round2(cur - prev), deltaPct: prev ? round2((cur - prev) / prev * 100) : null }];
  }));
  const sameWeekday = Object.fromEntries(SHAPES.map(shape => {
    const cur = Number(current.dailyShapeTotals?.[shape] || 0);
    const prev = Number(last.dailyShapeTotals?.[shape] || 0);
    return [shape, { current: round2(cur), last: round2(prev), delta: round2(cur - prev), deltaPct: prev ? round2((cur - prev) / prev * 100) : null }];
  }));
  return { available: true, shapes, sameWeekday };
}

function buildProtectedSkuCoverage(selectedProductRows = [], salesRows = [], map = []) {
  const rows = [];
  for (const sku of PROTECTED_SKUS) {
    const aliases = [sku.canonical, ...(sku.aliases || [])].map(canonicalKey);
    for (const store of sku.expectedStores || []) {
      const planQty = (selectedProductRows || []).filter(r => cleanStore(r.store) === store && aliases.some(a => productMatchesAlias(r.product || r.productName, a))).reduce((s, r) => s + (Number(r.totalPlan ?? r.qty) || 0), 0);
      const salesQty = (salesRows || []).filter(r => cleanStore(r.store) === store && aliases.some(a => productMatchesAlias(r.product, a))).reduce((s, r) => s + (Number(r.qty) || 0), 0);
      let status = 'ok_or_not_applicable';
      if ((selectedProductRows || []).length && planQty <= 0 && salesQty > 0) status = 'missing_from_plan_but_selling';
      else if ((selectedProductRows || []).length && planQty > 0) status = 'planned';
      else if (!(selectedProductRows || []).length) status = 'no_product_plan_loaded';
      rows.push({ store, product: sku.canonical, planQty: round2(planQty), salesQty: round2(salesQty), status });
    }
  }
  return rows;
}

function shapeRowsToShapeMap(shapeRows = []) {
  const rows = [];
  for (const r of shapeRows || []) {
    const product = r.product || r.Product || r.productName;
    const shape = normaliseShape(r.shape || r['Cook Shape']);
    if (!product || !shape || shape === 'OTHER') continue;
    rows.push({ product, ...weightsForShape(shape), aliases: productAliases(product) });
  }
  return normaliseShapeMap(rows);
}

function findShapeMatch(product = '', map = []) {
  const p = canonicalKey(product);
  if (!p) return null;
  const ranked = [...map].sort((a, b) => Math.max(...aliasesForProduct(b).map(x => x.length), 0) - Math.max(...aliasesForProduct(a).map(x => x.length), 0));
  let match = ranked.find(row => aliasesForProduct(row).some(a => p === a));
  if (match) return match;
  match = ranked.find(row => aliasesForProduct(row).some(a => a.length > 2 && safeContains(p, a)));
  if (match) return match;
  if (/SPECIAL|LIMITED|WEEKLY|FILLED/.test(p)) return ranked.find(row => /SPECIALS TOTAL/i.test(row.product));
  return null;
}

function safeContains(productKey, aliasKey) {
  if (aliasKey === 'NUTELLA' && /STRAWBERRY NUTELLA/.test(productKey)) return false;
  return productKey.includes(aliasKey) || aliasKey.includes(productKey);
}

function productMatchesAlias(product = '', aliasKey = '') {
  const p = canonicalKey(product);
  if (!p || !aliasKey) return false;
  if (aliasKey === 'NUTELLA' && /STRAWBERRY NUTELLA/.test(p)) return false;
  return p === aliasKey || p.includes(aliasKey) || aliasKey.includes(p);
}

function pct(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

function normaliseShape(shape = '') {
  const s = String(shape || '').toUpperCase().replace(/[^A-Z]+/g, ' ').trim();
  if (!s) return '';
  if (s.includes('RING')) return 'RING';
  if (s.includes('BALL')) return 'BALL';
  if (s.includes('LONG') || s.includes('FINGER') || s.includes('ECLAIR')) return 'LONG';
  if (s.includes('SCROLL')) return 'SCROLL';
  if (s.includes('APPLE')) return 'APPLE';
  if (s.includes('OTHER') || s.includes('UNMAPPED') || s.includes('UNKNOWN')) return 'OTHER';
  return SHAPES.includes(s) ? s : '';
}

function weightsForShape(shape = '') {
  const s = normaliseShape(shape) || 'OTHER';
  return { ring: s === 'RING' ? 1 : 0, ball: s === 'BALL' ? 1 : 0, long: s === 'LONG' ? 1 : 0, scroll: s === 'SCROLL' ? 1 : 0, apple: s === 'APPLE' ? 1 : 0 };
}

function canonicalKey(product = '') {
  return String(product || '').toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\bCREAM\b/g, 'CREME')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalFamily(product = '') {
  const p = String(product || '').trim();
  const match = findShapeMatch(p, DEFAULT_SHAPE_MAP);
  return match?.product || p || 'Unknown';
}

function aliasesForProduct(row = {}) {
  const aliases = [row.product, ...(row.aliases || [])].filter(Boolean);
  if (/CARAMEL/i.test(row.product || '')) aliases.push('CARAMEL ICED');
  if (/STRAWBERRY\s+NUTELLA/i.test(row.product || '')) aliases.push('STRAWBERRY NUTELLA CREAM');
  return [...new Set(aliases.map(canonicalKey).filter(Boolean))];
}

function productAliases(product = '') {
  const p = String(product || '').toUpperCase();
  const aliases = [];
  if (p.includes('CARAMEL')) aliases.push('CARAMEL ICED');
  if (p.includes('STRAWBERRY') && p.includes('NUTELLA')) aliases.push('STRAWBERRY NUTELLA CREAM');
  if (p === 'GLAZE') aliases.push('GLAZED');
  if (p.includes('CHOC')) aliases.push('CHOCOLATE ICED');
  if (p.includes('M&M')) aliases.push('MNMS');
  return aliases;
}

function mergeShapeMaps(base = [], overrides = []) {
  const out = [];
  const seen = new Set();
  for (const row of [...overrides, ...base]) {
    const key = canonicalKey(row.product);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return normaliseShapeMap(out);
}

function legacyPlanAsCurrent(plan = {}) {
  if (!plan || (!plan.productRows && !plan.cookRows)) return plan;
  return {
    source: plan.source,
    files: plan.files || [],
    weekStart: plan.weekStart,
    weekEnd: plan.weekEnd,
    planningDate: plan.planningDate,
    selectedDate: plan.selectedDate,
    productRows: plan.productRows || [],
    cookRows: plan.cookRows || [],
    shapeRows: plan.shapeRows || [],
    selectedProductRows: plan.selectedProductRows || [],
    selectedCookRows: plan.selectedCookRows || [],
    storeTotals: plan.storeTotals || {},
    dayTotals: plan.dayTotals || {},
    warnings: plan.warnings || []
  };
}

function chooseShapeTotals(productTotals = {}, cookTotals = {}) {
  return shapeTotal(productTotals) ? productTotals : cookTotals;
}
function sumShapeRows(rows = []) {
  const out = emptyShapeTotalsUpper();
  for (const row of rows || []) out[row.shape] = (out[row.shape] || 0) + (Number(row.qty) || 0);
  return roundShapeTotals(out);
}
function groupCookShapeTotals(rows = []) {
  const out = emptyShapeTotalsUpper();
  for (const row of rows || []) {
    const shape = normaliseShape(row.shape) || 'OTHER';
    out[shape] = (out[shape] || 0) + (Number(row.totalCook ?? row.qty) || 0);
  }
  return roundShapeTotals(out);
}
function roundShapeTotals(obj = {}) { return Object.fromEntries(SHAPES.map(shape => [shape, round2(Number(obj[shape] || 0))])); }
function shapeTotal(obj = {}) { return round2(SHAPES.reduce((s, shape) => s + Number(obj[shape] || 0), 0)); }
function emptyShapeTotalsUpper() { return Object.fromEntries(SHAPES.map(shape => [shape, 0])); }
function emptyShapeTotalsLower() { return { ring: 0, ball: 0, long: 0, scroll: 0, apple: 0, unknown: 0 }; }
function sumShapesLower(totals) { return ['ring', 'ball', 'long', 'scroll', 'apple'].reduce((s, k) => s + (Number(totals[k]) || 0), 0); }
function cleanStore(v = '') {
  const s = String(v || '').trim().toLowerCase();
  if (s.includes('pen')) return 'Penrith';
  if (s.includes('taren') || /\btp\b/.test(s)) return 'Taren Point';
  if (s.includes('bev') || /\bbh\b/.test(s)) return 'Beverly Hills';
  return String(v || '').trim() || 'Unknown';
}
function addNested(obj, a, b, val) { if (!obj[a]) obj[a] = {}; obj[a][b] = (obj[a][b] || 0) + (Number(val) || 0); }
function roundNested(obj = {}) { for (const a of Object.keys(obj)) for (const b of Object.keys(obj[a])) obj[a][b] = round2(obj[a][b]); return obj; }
function hourNumber(value = '') { const m = String(value || '').match(/(\d{1,2})/); return m ? Number(m[1]) : null; }
function addDays(iso, days) { if (!iso) return ''; const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function riskRank(risk) { return risk === 'high' ? 3 : risk === 'medium' ? 2 : risk === 'low' ? 1 : 0; }
function uniqueStrings(values = []) { return [...new Set((values || []).filter(Boolean).map(x => String(x)))]; }
