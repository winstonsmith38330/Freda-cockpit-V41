import fs from 'fs';
import path from 'path';
import { parseWhatsappUpload } from '../whatsappParser.js';

const SUPPORTED_IMPORT_RE = /\.(txt|zip)$/i;

export function syncWhatsappUpload(file) {
  const parsed = parseWhatsappUpload(file);
  if (!parsed.ok) {
    const message = parsed.error || 'WhatsApp upload could not be parsed.';
    return {
      ok: false,
      status: 'failed',
      error: message,
      errors: [message],
      parsed,
      diagnostics: parsed.diagnostics || {},
      note: 'Upload the WhatsApp export .txt file or a .zip containing a readable chat .txt export. Exports without media are preferred.'
    };
  }
  return {
    ok: true,
    status: 'success',
    source: 'WhatsApp export parser',
    capturedAt: new Date().toISOString(),
    summary: parsed,
    actions: parsed.actions || [],
    warnings: parsed.warnings || [],
    diagnostics: parsed.diagnostics || {},
    notes: 'Phase 1 parser supports exported .txt/.zip stock, sold-out and leftover messages. Photo vision/OCR is staged.'
  };
}

export function syncWhatsappImports(env = process.env) {
  const root = whatsappImportRoot(env);
  const startedAt = new Date().toISOString();
  const files = listWhatsappImportFiles(root);
  const parsed = [];
  const errors = [];
  const warnings = [];
  const actions = [];
  const summaries = [];

  for (const filePath of files) {
    const relativeName = path.relative(root, filePath).replace(/\\/g, '/');
    const result = syncWhatsappUpload({ path: filePath, originalname: relativeName });
    if (result.ok) {
      parsed.push({ file: relativeName, ok: true, storeHint: result.summary?.storeHint || 'Unknown', messageCount: result.summary?.messageCount || 0, actionCount: (result.actions || []).length, photoCount: result.summary?.photoCount || 0 });
      summaries.push(result.summary);
      actions.push(...(result.actions || []));
      warnings.push(...(result.warnings || []));
    } else {
      const message = result.error || `Could not parse ${relativeName}`;
      parsed.push({ file: relativeName, ok: false, error: message });
      errors.push(`${relativeName}: ${message}`);
    }
  }

  if (!files.length) {
    return {
      ok: false,
      status: 'not_synced',
      source: 'WhatsApp import folder',
      mode: 'whatsapp-import-folder-refresh',
      startedAt,
      finishedAt: new Date().toISOString(),
      error: `No WhatsApp .zip or .txt files found in ${root}`,
      errors: [`No WhatsApp .zip or .txt files found in ${root}`],
      diagnostics: whatsappImportDiagnostics(env)
    };
  }

  const storeHints = unique(summaries.map(x => x?.storeHint).filter(x => x && x !== 'Unknown'));
  const totalMessages = summaries.reduce((sum, x) => sum + Number(x?.messageCount || 0), 0);
  const totalPhotos = summaries.reduce((sum, x) => sum + Number(x?.photoCount || 0), 0);
  const summary = {
    source: 'WhatsApp import folder',
    storeHint: storeHints.join(', ') || 'Unknown',
    messageCount: totalMessages,
    photoCount: totalPhotos,
    importedFileCount: files.length,
    parsedFileCount: parsed.filter(x => x.ok).length,
    parsedAt: new Date().toISOString(),
    summary: `${parsed.filter(x => x.ok).length}/${files.length} WhatsApp import file(s) parsed from GitHub folder; ${totalMessages} message(s), ${actions.length} operational action(s), ${totalPhotos} possible photos/attachments. Stores detected: ${storeHints.join(', ') || 'Unknown'}.`
  };

  return {
    ok: actions.length > 0 || summaries.length > 0,
    status: errors.length && summaries.length ? 'partial_success' : summaries.length ? 'success' : 'failed',
    source: 'WhatsApp import folder',
    mode: 'whatsapp-import-folder-refresh',
    startedAt,
    finishedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
    summary,
    importedSummaries: summaries,
    actions,
    warnings: unique(warnings),
    errors: unique(errors),
    diagnostics: { ...whatsappImportDiagnostics(env), parsed },
    notes: 'Full refresh from server/data/imports/whatsapp. This replaces the previous WhatsApp live state when called by the app.'
  };
}

export function whatsappDiagnostics(env = process.env) {
  return {
    source: 'WhatsApp export parser',
    status: 'available',
    normalWorkflow: 'Nicolas can commit WhatsApp .zip/.txt exports under server/data/imports/whatsapp and click Refresh WhatsApp from GitHub imports. Manual upload remains available only as a fallback.',
    parsedSignals: ['sell-out time', 'leftover notes', 'stock usage words', 'store names', 'urgent manager actions'],
    supportedFiles: ['.txt', '.zip containing .txt or WhatsApp chat text'],
    importFolder: whatsappImportDiagnostics(env),
    recommendation: 'Use one export per store. Store detection reads BH, PN, or TP from the TXT filename inside each ZIP.'
  };
}

export function whatsappImportDiagnostics(env = process.env) {
  const root = whatsappImportRoot(env);
  const files = listWhatsappImportFiles(root).map(filePath => {
    const stat = fs.statSync(filePath);
    return { path: path.relative(root, filePath).replace(/\\/g, '/'), bytes: stat.size, mtime: stat.mtime.toISOString() };
  });
  return { root, rootExists: fs.existsSync(root), fileCount: files.length, files };
}

function whatsappImportRoot(env = process.env) {
  const configured = env.WHATSAPP_IMPORT_DIR || './data/imports/whatsapp';
  return path.resolve(process.cwd(), configured);
}

function listWhatsappImportFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  walk(root, out);
  return out.filter(filePath => SUPPORTED_IMPORT_RE.test(filePath)).sort();
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean).map(x => String(x)))];
}
