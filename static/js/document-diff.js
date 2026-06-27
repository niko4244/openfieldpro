// static/js/document-diff.js
// Extracted diff mode functions from document.js
// Dependencies (syncHighlighting, updateLineNumbers, saveDocument) are injected
// via setDiffDeps() called by document.js during init.

import uiModule from './ui.js';
import { docState } from './document-state.js';

// ── Injected dependencies (set by document.js) ──────────────────────────────
let syncHighlighting = () => {};
let updateLineNumbers = () => {};
let saveDocument = () => {};


export function setDiffDeps(deps) {
  if (deps.syncHighlighting !== undefined) syncHighlighting = deps.syncHighlighting;
  if (deps.updateLineNumbers !== undefined) updateLineNumbers = deps.updateLineNumbers;
  if (deps.saveDocument !== undefined) saveDocument = deps.saveDocument;
}

// ── Extracted from document.js ──────────────────────────────────────────────
  function _computeLineDiff(oldText, newText) {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const m = oldLines.length, n = newLines.length;

    // Build LCS table
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    // Backtrack to produce diff entries
    const entries = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        entries.push({ type: 'equal', line: oldLines[i - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        entries.push({ type: 'insert', line: newLines[j - 1] });
        j--;
      } else {
        entries.push({ type: 'delete', line: oldLines[i - 1] });
        i--;
      }
    }
    entries.reverse();
    return entries;
  }
  function _buildDiffChunks(entries) {
    const chunks = [];
    let chunkId = 0;
    let lineIdx = 0;
    let i = 0;
    while (i < entries.length) {
      const e = entries[i];
      if (e.type === 'equal') {
        lineIdx++;
        i++;
      } else {
        // Gather contiguous non-equal entries into a chunk
        const startLine = lineIdx;
        const oldLines = [], newLines = [];
        while (i < entries.length && entries[i].type !== 'equal') {
          if (entries[i].type === 'delete') oldLines.push(entries[i].line);
          else newLines.push(entries[i].line);
          i++;
        }
        chunks.push({
          id: chunkId++,
          oldLines,
          newLines,
          startLine,
          resolved: false,
          accepted: false,
        });
        lineIdx += oldLines.length + newLines.length;
      }
    }
    return chunks;
  }
  export function enterDiffMode(oldContent, newContent) {
    if (docState._diffModeActive) exitDiffMode(true);

    docState._diffModeActive = true;
    docState._diffOldContent = oldContent;
    docState._diffNewContent = newContent;

    const entries = _computeLineDiff(oldContent, newContent);
    docState._diffChunks = _buildDiffChunks(entries);
    docState._diffUnresolvedCount = docState._diffChunks.length;

    if (docState._diffChunks.length === 0) {
      docState._diffModeActive = false;
      if (uiModule) uiModule.showToast('No changes');
      return;
    }

    const textarea = document.getElementById('doc-editor-textarea');
    if (textarea) textarea.readOnly = true;
    const wrap = document.getElementById('doc-editor-wrap');
    if (wrap) wrap.classList.add('diff-mode');

    _renderDiffOverlay(entries);
    _renderDiffToolbar();
    _renderDiffGutter();

    // Update header button
    const diffBtn = document.getElementById('doc-diff-toggle-btn');
    if (diffBtn) diffBtn.classList.add('active');
  }
  function _renderDiffOverlay(entries) {
    const codeEl = document.getElementById('doc-editor-code');
    const gutter = document.getElementById('doc-line-numbers');
    if (!codeEl) return;

    codeEl.innerHTML = '';
    let gutterHtml = '';
    let oldNum = 0, newNum = 0;

    // Pre-assign chunk IDs to entries by walking chunks and entries together
    let chunkIdx = 0;
    let entryIdx = 0;
    const entryChunkMap = new Array(entries.length).fill(-1);
    while (entryIdx < entries.length) {
      if (entries[entryIdx].type === 'equal') {
        entryIdx++;
      } else {
        // This is the start of a change block — assign all contiguous non-equal entries to the current chunk
        const cid = chunkIdx < docState._diffChunks.length ? docState._diffChunks[chunkIdx].id : -1;
        while (entryIdx < entries.length && entries[entryIdx].type !== 'equal') {
          entryChunkMap[entryIdx] = cid;
          entryIdx++;
        }
        chunkIdx++;
      }
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.type === 'equal') {
        oldNum++; newNum++;
        const el = document.createElement('span');
        el.className = 'diff-line-equal';
        el.textContent = e.line + '\n';
        codeEl.appendChild(el);
        gutterHtml += newNum + '\n';
      } else if (e.type === 'delete') {
        oldNum++;
        const el = document.createElement('span');
        el.className = 'diff-line-del';
        if (entryChunkMap[i] >= 0) el.dataset.chunkId = entryChunkMap[i];
        el.textContent = e.line + '\n';
        codeEl.appendChild(el);
        gutterHtml += '−\n';
      } else {
        newNum++;
        const el = document.createElement('span');
        el.className = 'diff-line-add';
        if (entryChunkMap[i] >= 0) el.dataset.chunkId = entryChunkMap[i];
        el.textContent = e.line + '\n';
        codeEl.appendChild(el);
        gutterHtml += '+\n';
      }
    }

    if (gutter) gutter.textContent = gutterHtml;
    codeEl.dataset.hasDiff = '1';

    // Sync textarea to show the combined view (old + new interleaved) for scroll sizing
    const textarea = document.getElementById('doc-editor-textarea');
    if (textarea) {
      const allLines = entries.map(e => e.line);
      textarea.value = allLines.join('\n') + '\n';
    }
  }
  function _renderDiffToolbar() {
    let toolbar = document.getElementById('doc-diff-toolbar');
    if (toolbar) toolbar.remove();

    toolbar = document.createElement('div');
    toolbar.id = 'doc-diff-toolbar';
    toolbar.className = 'diff-toolbar';

    const status = document.createElement('span');
    status.className = 'diff-toolbar-status';
    status.id = 'diff-toolbar-status';
    _updateDiffStatus(status);

    const acceptAll = document.createElement('button');
    acceptAll.className = 'diff-toolbar-btn diff-toolbar-btn-accept';
    acceptAll.textContent = 'Accept All';
    acceptAll.addEventListener('click', () => _resolveAllChunks(true));

    const rejectAll = document.createElement('button');
    rejectAll.className = 'diff-toolbar-btn diff-toolbar-btn-reject';
    rejectAll.textContent = 'Reject All';
    rejectAll.addEventListener('click', () => _resolveAllChunks(false));

    toolbar.appendChild(status);
    toolbar.appendChild(acceptAll);
    toolbar.appendChild(rejectAll);

    const wrap = document.getElementById('doc-editor-wrap');
    if (wrap) wrap.parentNode.insertBefore(toolbar, wrap);
  }
  function _renderDiffGutter() {
    let gutterEl = document.getElementById('doc-diff-gutter');
    if (gutterEl) gutterEl.remove();

    gutterEl = document.createElement('div');
    gutterEl.id = 'doc-diff-gutter';
    gutterEl.className = 'diff-gutter';

    const codeEl = document.getElementById('doc-editor-code');
    if (!codeEl) return;

    // Insert chunk action buttons directly next to the first changed line of each chunk
    // This way they scroll naturally with the content
    requestAnimationFrame(() => {
      for (const chunk of docState._diffChunks) {
        if (chunk.resolved) continue;
        const firstEl = codeEl.querySelector(`[data-chunk-id="${chunk.id}"]`);
        if (!firstEl) continue;

        const actions = document.createElement('span');
        actions.className = 'diff-chunk-actions';
        actions.dataset.chunkId = chunk.id;

        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'diff-chunk-btn diff-chunk-btn-accept';
        acceptBtn.title = 'Accept change';
        acceptBtn.innerHTML = '✓';
        acceptBtn.addEventListener('click', (e) => { e.stopPropagation(); _resolveChunk(chunk.id, true); });

        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'diff-chunk-btn diff-chunk-btn-reject';
        rejectBtn.title = 'Reject change';
        rejectBtn.innerHTML = '✗';
        rejectBtn.addEventListener('click', (e) => { e.stopPropagation(); _resolveChunk(chunk.id, false); });

        actions.appendChild(acceptBtn);
        actions.appendChild(rejectBtn);

        // Insert at the start of the first line span
        firstEl.style.position = 'relative';
        firstEl.appendChild(actions);
      }
    });
  }
  function _updateDiffStatus(statusEl) {
    const el = statusEl || document.getElementById('diff-toolbar-status');
    if (!el) return;
    const resolved = docState._diffChunks.length - docState._diffUnresolvedCount;
    el.textContent = `${resolved} / ${docState._diffChunks.length} changes resolved`;
  }
  function _resolveChunk(chunkId, accept) {
    const chunk = docState._diffChunks.find(c => c.id === chunkId);
    if (!chunk || chunk.resolved) return;

    chunk.resolved = true;
    chunk.accepted = accept;
    docState._diffUnresolvedCount--;

    // Fade resolved lines in the overlay
    const codeEl = document.getElementById('doc-editor-code');
    if (codeEl) {
      codeEl.querySelectorAll(`[data-chunk-id="${chunkId}"]`).forEach(el => {
        el.classList.add('diff-chunk-resolved');
      });
    }

    // Remove the gutter buttons for this chunk
    const gutterActions = document.querySelector(`.diff-chunk-actions[data-chunk-id="${chunkId}"]`);
    if (gutterActions) gutterActions.remove();

    _updateDiffStatus();

    // Persist partial progress so refresh doesn't lose individually-resolved chunks
    _applyResolvedChunksToTextarea();
    saveDocument({ silent: true });

    if (docState._diffUnresolvedCount === 0) {
      setTimeout(() => exitDiffMode(false), 300);
    }
  }
  function _applyResolvedChunksToTextarea() {
    const textarea = document.getElementById('doc-editor-textarea');
    if (!textarea) return;
    const entries = _computeLineDiff(docState._diffOldContent || '', docState._diffNewContent || '');
    const result = [];
    let chunkIdx = 0;
    let i = 0;
    while (i < entries.length) {
      if (entries[i].type === 'equal') {
        result.push(entries[i].line);
        i++;
      } else {
        const chunk = docState._diffChunks[chunkIdx++];
        const chunkOld = [], chunkNew = [];
        while (i < entries.length && entries[i].type !== 'equal') {
          if (entries[i].type === 'delete') chunkOld.push(entries[i].line);
          else chunkNew.push(entries[i].line);
          i++;
        }
        // Resolved+accepted → use new; resolved+rejected OR unresolved → keep old
        if (chunk && chunk.resolved && chunk.accepted) {
          result.push(...chunkNew);
        } else {
          result.push(...chunkOld);
        }
      }
    }
    textarea.value = result.join('\n');
  }
  function _resolveAllChunks(accept) {
    for (const chunk of docState._diffChunks) {
      if (!chunk.resolved) {
        chunk.resolved = true;
        chunk.accepted = accept;
      }
    }
    docState._diffUnresolvedCount = 0;
    exitDiffMode(false);
  }
  export function exitDiffMode(discard) {
    if (!docState._diffModeActive) return;
    docState._diffModeActive = false;

    const textarea = document.getElementById('doc-editor-textarea');
    const codeEl = document.getElementById('doc-editor-code');
    const wrap = document.getElementById('doc-editor-wrap');
    if (wrap) wrap.classList.remove('diff-mode');

    if (discard) {
      // Reject all — restore original content
      if (textarea) textarea.value = docState._diffOldContent || '';
    } else {
      // Build final content from resolved chunks
      const oldLines = (docState._diffOldContent || '').split('\n');
      const newLines = (docState._diffNewContent || '').split('\n');
      const entries = _computeLineDiff(docState._diffOldContent || '', docState._diffNewContent || '');

      const result = [];
      let chunkIdx = 0;
      let i = 0;
      while (i < entries.length) {
        if (entries[i].type === 'equal') {
          result.push(entries[i].line);
          i++;
        } else {
          // Find the matching chunk
          const chunk = docState._diffChunks[chunkIdx++];
          // Skip all entries belonging to this chunk
          const chunkOld = [], chunkNew = [];
          while (i < entries.length && entries[i].type !== 'equal') {
            if (entries[i].type === 'delete') chunkOld.push(entries[i].line);
            else chunkNew.push(entries[i].line);
            i++;
          }
          if (chunk && chunk.accepted) {
            result.push(...chunkNew);
          } else {
            result.push(...chunkOld);
          }
        }
      }
      if (textarea) textarea.value = result.join('\n');
    }

    // Restore editor state
    if (textarea) textarea.readOnly = false;
    if (codeEl) delete codeEl.dataset.hasDiff;

    // Clean up toolbar and any remaining chunk action buttons
    const toolbar = document.getElementById('doc-diff-toolbar');
    if (toolbar) toolbar.remove();
    document.querySelectorAll('.diff-chunk-actions').forEach(el => el.remove());

    // Reset state
    docState._diffOldContent = null;
    docState._diffNewContent = null;
    docState._diffChunks = [];
    docState._diffUnresolvedCount = 0;

    const diffBtn = document.getElementById('doc-diff-toggle-btn');
    if (diffBtn) diffBtn.classList.remove('active');

    syncHighlighting();
    updateLineNumbers(textarea ? textarea.value : '');
    saveDocument({ silent: true });
  }
  

