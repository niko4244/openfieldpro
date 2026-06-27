// static/js/document-state.js
// Shared mutable state for the document module — consumed by document.js and
// document-diff.js.  Exported `let` bindings are read-only to importers under
// ES module semantics, so all mutable values live inside a single exported
// object that both files can read and write freely.
//
// The isDiffModeActive getter lives here because it's a read-only projection
// of the state — both consumers need it and neither owns it.

export const docState = {
  // ── Diff mode state ─────────────────────────────────────────────────────
  _diffModeActive: false,
  _diffOldContent: null,
  _diffNewContent: null,
  _diffChunks: [],
  _diffUnresolvedCount: 0,
  DIFF_MODE_THRESHOLD: 3,
};

export function isDiffModeActive() { return docState._diffModeActive; }
