import fs from 'fs';
import AdmZip from 'adm-zip';

const STORE_PATTERNS = [
  ['Beverly Hills', /beverly|la\s*donuts?\s*bh|\bbh\b/i],
  ['Penrith', /penrith|la\s*donuts?\s*pn|\bpen\b|\bpn\b/i],
  ['Taren Point', /taren|la\s*donuts?\s*tp|\btp\b/i],
  ["Frieda's Pies", /frieda|frida|pies/i]
];

const MEDIA_FILE_RE = /\.(jpg|jpeg|png|gif|webp|heic|mp4|mov|m4a|opus|webm|pdf)$/i;

export function parseWhatsappUpload(file) {
  const diagnostics = { originalName: file?.originalname || '', entries: [], textFiles: [], bytesRead: 0, warnings: [] };
  try {
    const name = String(file?.originalname || '').toLowerCase();
    const filePath = file?.path;
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'Uploaded file was not available on the server. Please retry the upload.', diagnostics };

    let text = '';
    const sourceNames = [file?.originalname || ''];
    if (name.endsWith('.zip')) {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      diagnostics.entries = entries.map(e => ({ name: e.entryName, size: e.header?.size || 0, directory: e.isDirectory })).slice(0, 200);
      for (const entry of entries) if (entry?.entryName) sourceNames.push(entry.entryName);
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const entryName = entry.entryName || '';
        if (MEDIA_FILE_RE.test(entryName)) continue;
        const looksLikeChatText = /\.txt$/i.test(entryName) || /chat|whatsapp|_chat|discussion|conversation/i.test(entryName);
        if (!looksLikeChatText) continue;
        const raw = entry.getData();
        if (!raw || !raw.length) continue;
        const decoded = decodeBuffer(raw);
        const score = whatsappTextScore(decoded);
        if (score <= 0) continue;
        text += '\n' + decoded;
        diagnostics.textFiles.push({ name: entryName, bytes: raw.length, score });
        diagnostics.bytesRead += raw.length;
      }
      if (!text.trim()) {
        // Fallback for exports where the chat text has no .txt suffix.
        for (const entry of entries) {
          if (entry.isDirectory || MEDIA_FILE_RE.test(entry.entryName || '')) continue;
          const raw = entry.getData();
          if (!raw || raw.length > 5_000_000) continue;
          const decoded = decodeBuffer(raw);
          const score = whatsappTextScore(decoded);
          if (score <= 1) continue;
          text += '\n' + decoded;
          diagnostics.textFiles.push({ name: entry.entryName, bytes: raw.length, score, fallback: true });
          diagnostics.bytesRead += raw.length;
        }
      }
    } else {
      const raw = fs.readFileSync(filePath);
      text = decodeBuffer(raw);
      diagnostics.textFiles.push({ name: file.originalname, bytes: raw.length, score: whatsappTextScore(text) });
      diagnostics.bytesRead = raw.length;
    }

    if (!text.trim()) {
      return {
        ok: false,
        error: 'No readable WhatsApp chat text found. Export the chat without media if possible, or upload the .txt file inside the WhatsApp export ZIP.',
        diagnostics
      };
    }

    const uploadStoreHint = inferStoreFromSources(sourceNames);
    diagnostics.storeHint = uploadStoreHint;
    const messages = normaliseWhatsAppLines(text);
    if (!messages.length) diagnostics.warnings.push('Text was read, but no standard WhatsApp timestamp lines were detected. Parsed as free text.');
    const actions = extractActions(messages, uploadStoreHint);
    const stockRequests = extractStockRequests(text);
    const soldOutSignals = actions.filter(a => a.type === 'Sell-out').map(a => ({ store: a.store, time: a.time, text: a.body }));
    const leftoverSignals = actions.filter(a => a.type === 'Leftover').map(a => ({ store: a.store, time: a.time, text: a.body }));
    const photoCount = countPhotoMarkers(text, diagnostics.entries);
    return {
      ok: true,
      source: file.originalname,
      storeHint: uploadStoreHint,
      messageCount: messages.length,
      photoCount,
      actions,
      stockRequests,
      soldOutSignals,
      leftoverSignals,
      warnings: diagnostics.warnings,
      diagnostics,
      summary: summarize(actions, stockRequests, photoCount, messages.length),
      parsedAt: new Date().toISOString()
    };
  } catch (err) {
    return { ok: false, error: `WhatsApp upload parser failed: ${String(err?.message || err)}`, diagnostics };
  }
}

function decodeBuffer(buffer) {
  if (!buffer || !buffer.length) return '';
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer);
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer);
  const sample = buffer.slice(0, Math.min(600, buffer.length));
  let zeros = 0;
  for (const b of sample) if (b === 0) zeros += 1;
  if (zeros > sample.length * 0.08) return new TextDecoder('utf-16le').decode(buffer);
  try { return new TextDecoder('utf-8', { fatal: false }).decode(buffer); } catch (_err) { return buffer.toString('utf8'); }
}

function whatsappTextScore(text = '') {
  if (!text || typeof text !== 'string') return 0;
  let score = 0;
  if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}.*\d{1,2}:\d{2}/.test(text)) score += 3;
  if (/whatsapp|messages and calls|end-to-end encrypted|attached|omitted|image|video/i.test(text)) score += 1;
  if (/sold out|sell.?out|leftover|stock|beverly|penrith|taren|balls|rings|vanilla|nutella|caramel/i.test(text)) score += 2;
  return score;
}

function countPhotoMarkers(text = '', entries = []) {
  const textMarkers = (text.match(/\b(image omitted|photo omitted|video omitted|<attached:|attached media omitted|image omise|image absente|imagen omitida|media omitted)\b/gi) || []).length;
  const fileMarkers = (entries || []).filter(e => MEDIA_FILE_RE.test(e.name || '')).length;
  return textMarkers + fileMarkers;
}

function normaliseWhatsAppLines(text) {
  const out = [];
  const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  for (const line of lines) {
    const parsed = parseWhatsAppLine(line);
    if (parsed) out.push(parsed);
    else if (out.length) out[out.length - 1].body += ' ' + line;
    else out.push({ date: '', time: '', sender: '', body: line, raw: line });
  }
  return out;
}
function parseWhatsAppLine(line) {
  // iOS/Android patterns:
  // [19/06/2026, 19:42:10] Name: message
  // 19/06/2026, 7:42 pm - Name: message
  // 19/06/2026, 19:42 - message
  let m = line.match(/^\[?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm|AM|PM)?)\]?\s+-?\s*([^:]{1,100})?:\s*(.*)$/);
  if (!m) m = line.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm|AM|PM)?)\s+-\s*(.*)$/);
  if (!m) return null;
  if (m.length === 5) return { date: m[1], time: to24h(m[2]), sender: m[3] || '', body: m[4] || '', raw: line };
  return { date: m[1], time: to24h(m[2]), sender: '', body: m[3] || '', raw: line };
}
function to24h(value) {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return s;
  let h = Number(m[1]);
  const min = m[2];
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

function extractActions(messages, storeHint = 'Unknown') {
  const actions = [];
  for (const msg of messages) {
    const line = msg.body || msg.raw || '';
    const lower = line.toLowerCase();
    const store = inferStore(`${msg.sender} ${line}`, storeHint);
    if (/sell.?out|sold out|soldout|empty|finished|no more|run out|ran out|plus rien|rupture/.test(lower)) {
      actions.push(makeAction('Sell-out', msg, store, 'High', 'Sold-out / empty stock signal', 'Check sell-out timing. If more than 3 hours before close, increase next same-day production unless it was planned/FOMO.'));
    } else if (/left.?over|leftover|waste|remain|remaining|reste|restant/.test(lower)) {
      actions.push(makeAction('Leftover', msg, store, 'Medium', 'Leftover / waste signal', 'Record leftover product and reduce or re-balance next week.'));
    } else if (/stock|need|order|milk|container|coffee shot|cups|bags|boxes|tray|gloves|napkins|balls|rings|besoin|commander/.test(lower)) {
      actions.push(makeAction('Stock', msg, store, 'Medium', 'Stock request / usage signal', 'Add to weekly stock-use estimate and two-trip delivery plan.'));
    } else if (/clean|display|cabinet|photo|training|staff|dirty|standard|présentation/.test(lower)) {
      actions.push(makeAction('Ops', msg, store, 'Medium', 'Ops / training signal', 'Manager follow-up or training evidence required.'));
    }
  }
  return actions.slice(0, 200);
}

function extractStockRequests(text) {
  const words = ['milk', 'coffee', 'cups', 'bags', 'boxes', 'gloves', 'napkins', 'trays', 'balls', 'rings', 'containers', 'labels', 'vanilla', 'strawberry nutella', 'caramel'];
  const counts = {};
  for (const word of words) {
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
    counts[word] = (text.match(re) || []).length;
  }
  return Object.entries(counts).filter(([, count]) => count).map(([item, count]) => ({ item, count }));
}
function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function inferStore(text = '', fallback = 'Unknown') {
  const hit = STORE_PATTERNS.find(([, re]) => re.test(String(text || '')));
  return hit?.[0] || fallback || 'Unknown';
}

function inferStoreFromSources(sourceNames = []) {
  const joined = (sourceNames || []).filter(Boolean).map(x => String(x)).join(' | ');
  // The WhatsApp exports used operationally include the store code in the TXT
  // filename inside the ZIP, e.g. "LA DONUTS PN (reporting)",
  // "LA DONUT TP (reporting)", or "LA Donuts BH (reporting)".
  return inferStore(joined, 'Unknown');
}

function makeAction(type, msg, store, priority, title, recommendation) {
  return {
    id: `wa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    store,
    time: msg.time || '',
    sender: msg.sender || '',
    priority,
    title: `${store !== 'Unknown' ? store + ': ' : ''}${title}`,
    body: `${msg.time ? msg.time + ' · ' : ''}${msg.sender ? msg.sender + ': ' : ''}${msg.body || msg.raw || ''}`,
    action: recommendation,
    recommendation,
    owner: 'Manager',
    status: 'Open'
  };
}

function summarize(actions, stockRequests, photoCount, messageCount) {
  const sellouts = actions.filter(a => a.type === 'Sell-out').length;
  const leftovers = actions.filter(a => a.type === 'Leftover').length;
  return `${messageCount} WhatsApp message(s) parsed; ${actions.length} operational action(s) detected: ${sellouts} sell-out signals, ${leftovers} leftover signals, ${stockRequests.length} stock/product terms, ${photoCount} possible photos/attachments.`;
}
