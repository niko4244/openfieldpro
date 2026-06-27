/**
 * scripts/dedup-css.mjs
 *
 * Deduplication pass for the 8 CSS partials.
 *
 * Strategy:
 * 1. Parse all 8 files to extract selector → body pairs
 * 2. Find cross-file duplicates (same selector in multiple files)
 * 3. Identify IDENTICAL duplicates (same body text) — safe to remove
 * 4. Identify NEAR-IDENTICAL duplicates (same selector, different body) — report for review
 * 5. For identical duplicates, remove the copy from the file that loads LATER
 *    (keeping the original in the earlier-loading file preserves the cascade)
 *
 * Loading order: core → layout → chat → mobile → modals → components → editor → tools
 *
 * Usage: node scripts/dedup-css.mjs
 * Dry run:  node scripts/dedup-css.mjs --dry-run
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname.replace(/\\/g, '/').replace(/\/scripts$/, '');

const LOAD_ORDER = [
  'core.css', 'layout.css', 'chat.css', 'mobile.css',
  'modals.css', 'components.css', 'editor.css', 'tools.css',
];

const files = LOAD_ORDER;

// A CSS-aware parser to extract rules
// Focuses on: selector text, opening brace, body, closing brace
function parseRules(css, fileLabel) {
  const rules = [];
  let pos = 0;
  const len = css.length;

  function skipWS() { while (pos < len && /\s/.test(css[pos])) pos++; }

  function skipComment() {
    if (pos + 1 >= len) return false;
    if (css[pos] === '/' && css[pos + 1] === '*') {
      pos += 2;
      while (pos + 1 < len && !(css[pos] === '*' && css[pos + 1] === '/')) pos++;
      pos += 2;
      return true;
    }
    if (css[pos] === '/' && css[pos + 1] === '/') {
      while (pos < len && css[pos] !== '\n') pos++;
      return true;
    }
    return false;
  }

  function extractBody() {
    // Assumes pos is just past the opening {
    let depth = 1;
    const start = pos;
    while (pos < len && depth > 0) {
      if (css[pos] === '{') depth++;
      else if (css[pos] === '}') depth--;
      else if (css[pos] === '"' || css[pos] === "'") {
        const q = css[pos]; pos++;
        while (pos < len && css[pos] !== q) { if (css[pos] === '\\') pos++; pos++; }
      }
      else if (pos + 1 < len && css[pos] === '/' && (css[pos+1] === '*' || css[pos+1] === '/')) { skipComment(); continue; }
      pos++;
    }
    return css.slice(start, depth === 0 ? pos - 1 : pos);
  }

  while (pos < len) {
    skipWS(); if (pos >= len) break;
    const beforeComment = pos;
    if (skipComment()) continue;

    // @-rules
    if (css[pos] === '@') {
      const atStart = pos;
      while (pos < len && css[pos] !== '{' && css[pos] !== ';') { if (skipComment()) continue; pos++; }
      const atRule = css.slice(atStart, pos);
      if (css[pos] === ';') { pos++; continue; }
      if (css[pos] === '{') { pos++;
        if (atRule.trim().startsWith('@media')) {
          const mediaBody = extractBody();
          const inner = mediaBody.slice(mediaBody.lastIndexOf('}') + 1);
          const innerRules = parseRules(inner, fileLabel);
          for (const r of innerRules) rules.push(r);
        }
      }
      continue;
    }

    // Rule: selector { body }
    const selStart = pos;
    let paren = 0;
    while (pos < len) {
      if (css[pos] === '(') paren++;
      else if (css[pos] === ')') paren--;
      else if (css[pos] === '{' && paren === 0) break;
      else if (skipComment()) continue;
      pos++;
    }
    const selRaw = css.slice(selStart, pos).trim();
    if (!selRaw) { pos++; continue; }
    if (/^\d+%$/.test(selRaw) || /^(from|to)$/i.test(selRaw)) {
      if (css[pos] === '{') { pos++; extractBody(); }
      continue;
    }

    if (css[pos] === '{') {
      pos++;
      const body = extractBody().trim();
      // Reconstruct: the full text of this rule from selStart to pos
      const ruleEnd = pos;
      const fullText = css.slice(selStart, ruleEnd);

      // Split comma selectors
      const parts = [];
      let cur = ''; let d = 0; let b = 0;
      for (let i = 0; i < selRaw.length; i++) {
        const ch = selRaw[i];
        if (ch === '(') d++;
        else if (ch === ')') d--;
        else if (ch === '[') b++;
        else if (ch === ']') b--;
        else if (ch === ',' && d === 0 && b === 0) { if (cur.trim()) parts.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      if (cur.trim()) parts.push(cur.trim());

      for (const sel of parts) {
        rules.push({
          selector: normalizeSelector(sel.trim()),
          originalSelector: sel.trim(),
          body: body,
          fullText: fullText,
          selStart, // position in CSS text
          ruleEnd,
          file: fileLabel,
          line: css.slice(0, selStart).split('\n').length,
        });
      }
    }
  }
  return rules;
}

function normalizeSelector(s) {
  return s.replace(/\s+/g, ' ').replace(/\s*([>+~])\s*/g, '$1').replace(/\s*:\s*/g, ':').trim();
}

const DRY_RUN = process.argv.includes('--dry-run');

console.log('\n  CSS Deduplication');
console.log('  ' + (DRY_RUN ? 'DRY RUN — no files will be modified' : '='.repeat(40)));
console.log();

// Parse all files
const fileRules = {};
for (const f of files) {
  const css = readFileSync(`${root}/static/css/${f}`, 'utf-8');
  fileRules[f] = { css, rules: parseRules(css, f) };
}

// Build selector index
const selectorIndex = new Map(); // selector -> [{file, body, ...}]
for (const [f, data] of Object.entries(fileRules)) {
  for (const rule of data.rules) {
    if (!selectorIndex.has(rule.selector)) selectorIndex.set(rule.selector, []);
    selectorIndex.get(rule.selector).push({ ...rule, file: f });
  }
}

// Find cross-file duplicates
const identicalDupes = []; // same selector + same body
const nearDupes = [];      // same selector, different body

for (const [sel, entries] of selectorIndex) {
  const uniqFiles = [...new Set(entries.map(e => e.file))];
  if (uniqFiles.length < 2) continue;

  // Group by body text
  const bodyGroups = new Map();
  for (const e of entries) {
    if (!bodyGroups.has(e.body)) bodyGroups.set(e.body, []);
    bodyGroups.get(e.body).push(e);
  }

  // Identical duplicates: same body in multiple files
  for (const [body, group] of bodyGroups) {
    const filesWithBody = [...new Set(group.map(e => e.file))];
    if (filesWithBody.length > 1) {
      identicalDupes.push({ selector: sel, body, entries: group, files: filesWithBody });
    }
  }

  // Near duplicates: different bodies in different files
  if (bodyGroups.size > 1) {
    const differentFileBodies = [];
    for (const [body, group] of bodyGroups) {
      for (const e of group) {
        differentFileBodies.push({ file: e.file, body, bodyPreview: body.length > 80 ? body.slice(0, 80) + '…' : body });
      }
    }
    nearDupes.push({ selector: sel, variants: differentFileBodies });
  }
}

// ── Remove identical duplicates from later-loading files ───────────────

// For each identical duplicate group, keep the copy in the EARLIEST-loading file
// and remove from the rest

const removals = [];
const removalKeys = new Set(); // "file:selector:body" to prevent double-counting

for (const d of identicalDupes) {
  // Sort files by load order
  const sorted = [...d.files].sort((a, b) => LOAD_ORDER.indexOf(a) - LOAD_ORDER.indexOf(b));
  const keepFile = sorted[0]; // earliest load = keep
  const removeFiles = sorted.slice(1);

  for (const removeFile of removeFiles) {
    const key = `${removeFile}:${d.selector}:${d.body}`;
    if (removalKeys.has(key)) continue;
    removalKeys.add(key);
    removals.push({ selector: d.selector, body: d.body, keepFile, removeFile });
  }
}

console.log(`  Found ${identicalDupes.length} identical cross-file selectors`);
console.log(`  Found ${nearDupes.length} near-duplicate selectors (different bodies)`);
console.log(`  ${removals.length} redundant copies to remove`);
console.log();

// ── Check if we're skipping anything due to position in same file ─────

// For each removal, find the exact text in the source file and remove it
let totalRemoved = 0;
let totalBytes = 0;

// Group removals by file
const removalsByFile = {};
for (const r of removals) {
  if (!removalsByFile[r.removeFile]) removalsByFile[r.removeFile] = [];
  removalsByFile[r.removeFile].push(r);
}

for (const [removeFile, fileRemovals] of Object.entries(removalsByFile)) {
  let css = fileRules[removeFile].css;
  const rules = fileRules[removeFile].rules;

  console.log(`  Processing ${removeFile}: ${fileRemovals.length} removals`);

  // Sort removals by position (reverse order so we can remove without offset issues)
  const sortedRemovals = [];
  for (const r of fileRemovals) {
    // Find all matching rules in this file
    const matching = rules.filter(rule =>
      normalizeSelector(rule.originalSelector) === normalizeSelector(r.selector) &&
      rule.body === r.body
    );
    for (const m of matching) {
      sortedRemovals.push(m);
    }
  }

  // Sort by position DESCENDING so we remove from bottom up
  sortedRemovals.sort((a, b) => b.selStart - a.selStart);

  // Track removed positions to avoid duplicates from comma-separated selectors
  const removedPositions = new Set();
  let fileBytes = 0;

  for (const rule of sortedRemovals) {
    // If this position was already removed (via comma-separated selector sharing same rule),
    // skip it
    // Actually each position is unique because selStart differs per individual selector.
    // But for comma-separated selectors in the same rule, they share the same text span.
    // We need to only remove the full text once.

    // Build a position key that covers the full rule text
    const posKey = `${rule.selStart}:${rule.ruleEnd}`;
    if (removedPositions.has(posKey)) continue;
    removedPositions.add(posKey);

    const fullRuleText = css.slice(rule.selStart, rule.ruleEnd);
    fileBytes += Buffer.byteLength(fullRuleText, 'utf-8');

    if (!DRY_RUN) {
      // Remove this rule + surrounding whitespace/newlines
      // We need to be careful not to remove too much. Remove from the end of the
      // previous line's content up to the end of this rule.
      const before = css.slice(0, rule.selStart);
      const after = css.slice(rule.ruleEnd);

      // Eat whitespace/newlines after the rule
      let i = 0;
      while (i < after.length && (after[i] === '\n' || after[i] === '\r' || after[i] === ' ' || after[i] === '\t')) i++;

      css = before + after.slice(i);
    }

    const line = css.slice(0, rule.selStart).split('\n').length;
    const bodyPreview = rule.body.length > 60 ? rule.body.slice(0, 60) + '…' : rule.body;
    console.log(`    ✗ remove ${rule.file}:L${line}  { ${bodyPreview} }`);
  }

  if (!DRY_RUN) {
    writeFileSync(`${root}/static/css/${removeFile}`, css, 'utf-8');
  }

  totalRemoved += sortedRemovals.length;
  totalBytes += fileBytes;
}

console.log();
if (DRY_RUN) {
  console.log(`  Dry run complete. ${totalRemoved} would be removed (~${(totalBytes / 1024).toFixed(1)} KB).`);
} else {
  console.log(`  Removed ${totalRemoved} duplicate rules (~${(totalBytes / 1024).toFixed(1)} KB).`);
}

// ── Report near duplicates ─────────────────────────────────────────────

if (nearDupes.length > 0) {
  console.log(`\n  ${'─'.repeat(50)}`);
  console.log(`  Near-duplicate selectors (different bodies — review manually):\n`);

  for (const d of nearDupes) {
    console.log(`  ${d.selector}`);
    for (const v of d.variants) {
      console.log(`    ${v.file}: { ${v.bodyPreview} }`);
    }
    console.log();
  }
}

console.log();
