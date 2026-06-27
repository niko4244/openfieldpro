#!/bin/bash
# ponytail: bulk-migrate 49 Hermes skills into Odysseus data/skills/brainz/. The 16 already
# present in Odysseus are skipped (their Odysseus-formatted SKILL.md wins). Default YAML
# frontmatter is auto-generated; source files are copied verbatim.
# Ceiling: one-size-fits-all defaults. Per-skill confidence and allowed-tools must be
# tuned later when each skill is actually used (e.g. mutating: true should be reviewed).
# Upgrade: a focused handbook-check that crosswalks skill bodies to tool permissions.

set -e
SRC="$HOME/Brainz/skills"
DST="$HOME/Brainz/odysseus/data/skills/brainz"
SKIP=(
  coder github-scout hermes-appliance hyperresearch mining-ops-bot obsidian
  odysseus-tools-cheatsheet portfolio pr-reviewer researcher securitybot
  smallcode sportsclaw sysbot tradingdesk understand-anything
)

# ponytail: dst-guard helper, used at both mkdir call sites below. Track the
# rule of three — currently used twice (top-level $DST and per-skill
# $DST/$name). If a third call site appears elsewhere in scripts/migrate_hermes/,
# hoist this into a shared _lib.sh and source it from each script; until then
# the in-file copy is cheaper than the cross-script import overhead.
# Predicate: `[ -d "$p" ] || rm -rf "$p" 2>/dev/null || true` collapses the
# four pre-existing $p states — valid dir (no-op), non-dir stub (stripped),
# broken symlink (stripped), missing (rm is a no-op on absent). mkdir -p then
# succeeds unconditionally.
# Ceiling: rm -rf on a populated dir is real-but-rare. Acceptable here because
# the rebuilt-from-source contract is documented in the file-level ponytail block.
# Upgrade: per-file hash-check partial update if manual edits to migrated
# contents become a recurring pattern.
ensure_dir_writable() {
  # ${1:?...} catches programmer error: an empty $1 lands `mkdir -p ""`
  # confusingly under set -e; this aborts loud at the call site instead.
  local p="${1:?usage: ensure_dir_writable <path>}"
  [ -d "$p" ] || rm -rf "$p" 2>/dev/null || true
  mkdir -p "$p"
}

ensure_dir_writable "$DST"

count_copied=0; count_skipped=0; count_fail=0
for d in "$SRC"/*/; do
  name=$(basename "$d")
  if printf '%s\n' "${SKIP[@]}" | grep -qx "$name"; then count_skipped=$((count_skipped+1)); continue; fi
  if [ ! -f "$d/SKILL.md" ] && [ ! -f "$d/skill.md" ]; then count_fail=$((count_fail+1)); continue; fi
  # Copy directory contents (winner SKILL.md written below)
  ensure_dir_writable "$DST/$name"
  cp -r "$d"/. "$DST/$name/" 2>/dev/null || true
  # Generate Odysseus-format SKILL.md
  cat > "$DST/$name/SKILL.md" <<EOF
---
confidence: 0.7        # ponytail: bulk-migrated default; tune per-skill when used
category: hermes-migrated
status: published
source: hermes
owner: admin
name: $name
version: 1.0.0
description: "Hermes-migrated skill for $name (auto-bridged by ~/Brainz/skills/migrate-skills.sh)"
triggers:
  - "$name"
  - "run $name"
allowed-tools:
  - bash
  - read
  - write
  - mcp__*             # ponytail: allow all MCPs so migrated scripts work; tighten per-skill later
mutating: false         # ponytail: observe-only default; flip to true only if skill writes external state
---

# $name

Auto-migrated from \`~/Brainz/skills/$name/\`.  Source markdown preserved below the
\`## Source Body\` heading for fidelity.

## Activation
Auto-triggers on prompts containing \`$name\` or \`run $name\`.

## Files
Inherited from source: \`$(ls "$DST/$name" 2>/dev/null | tr '\n' ' ')\`

## Source Body
EOF
  # Append source body (prefers skill.md lowercase)
  src_doc="$d/skill.md"; [ -f "$d/SKILL.md" ] && src_doc="$d/SKILL.md"
  [ -f "$src_doc" ] && tail -n +2 "$src_doc" >> "$DST/$name/SKILL.md" || true
  count_copied=$((count_copied+1))
done

echo "\u2713 Copied: $count_copied    \u26a0 Skipped (already in Odysseus): $count_skipped    \u2717 Failed (no SKILL): $count_fail"
echo "--- Final state ---"
ls "$DST" | wc -l
