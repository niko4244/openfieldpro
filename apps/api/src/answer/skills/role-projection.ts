// =============================================================================
// apps/api/src/answer/skills/role-projection.ts
// -----------------------------------------------------------------------------
// Projects the Brainz skill catalog (Brainz/skills/stable/*/SKILL.md) into a
// typed array that M2's Team-Draft can pick canonically without guessing each
// skill's role.
//
// Single source of truth: the `role:` field in SKILL.md YAML frontmatter.
// Every skill in stable/ MUST have one. This projector is intentionally tiny
// and has zero new dependencies — just node:fs and Zod.
//
// ponytail: frontmatter parser is hand-rolled (no `yaml` dep). Ceiling: the
//   parser only handles the subset of YAML Brainz uses today (key:value,
//   block-style lists with `  - ` prefix, bare booleans). Upgrade: swap in
//   `yaml` once a skill needs nested maps or anchors.
// ponytail: projector skips skills that are missing `role:` (logs no warning
//   here). Ceiling: silent skips mean a regression in the catalog silently
//   drops M2's team-draft surface. Upgrade: surface the skipped-path list as
//   a return value so callers can fail-loud on incomplete catalogs.
// ponytail: SKILL.md doc body is intentionally IGNORED for role classification
//   — every classification decision is anchored to the explicit `role:`
//   field. If two skills later disagree on the same body, the frontmatter
//   wins. Upgrade: nothing — this is the design, not a shortcut.
// =============================================================================

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * Skill roles. Pinned by the conductor plan:
 *   - worker      long-running produce-answer
 *   - verifier    binary pass/fail with evidence
 *   - critic      rewrite-with-deltas
 *   - thinker     plan-decompose
 *   - capability  tool/adapter M3 invokes directly (not a team role)
 *   - orchestrator multi-agent framework M2 picks as team topology
 */
export const SKILL_ROLES = [
  "worker",
  "verifier",
  "critic",
  "thinker",
  "capability",
  "orchestrator",
] as const;
export type SkillRole = (typeof SKILL_ROLES)[number];

export const SkillCatalogRowSchema = z.object({
  skillId: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(SKILL_ROLES),
  description: z.string(),
  triggers: z.array(z.string()),
  mutating: z.boolean(),
  version: z.string(),
  hasRun: z.boolean(),
});
export type SkillCatalogRow = z.infer<typeof SkillCatalogRowSchema>;

/**
 * Tiny YAML-frontmatter parser. Handles the subset Brainz skills use today:
 *   - bare `key: value` scalars
 *   - bare `key: true` / `key: false` booleans
 *   - block-style lists with `  - value` continuations
 *
 * Throws on malformed input. Caller decides whether to surface or skip.
 */
export function parseSkillFrontmatter(
  md: string,
): Record<string, string | string[] | boolean> {
  const m = md.match(/^---\n([\s\S]+?)\n---\n?/);
  if (!m) throw new Error("SKILL.md missing YAML frontmatter (no '---' delimiter)");
  const out: Record<string, string | string[] | boolean> = {};
  const lines = m[1].split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kv = line.match(/^([a-z_][a-z_0-9-]*):\s*(.*)$/i);
    if (!kv) {
      i++;
      continue;
    }
    const [, key, raw] = kv;
    const head = raw.trim();
    /* ponytail: block-list keys (`triggers`, `allowed-tools`) MUST be
       handled BEFORE the empty-head skip. A bare `triggers:` line with
       no inline value expects a `  - item` continuation on the next
       lines; treating empty head as skip fires before we ever enter the
       block-list branch. Ceiling: `- foo:` continuations whose value is
       itself a sub-map (e.g. `- meta:\n    k: v`) get flattened into a
       single string instead of preserving nested structure. Upgrade:
       cover block-map (`  key: val`) when a future skill needs structured
       trigger metadata. */
    if (key === "triggers" || key === "allowed-tools") {
      const items: string[] = [];
      if (head.startsWith("[") && head.endsWith("]")) {
        items.push(
          ...head
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, "")),
        );
        i++;
        out[key] = items;
        continue;
      }
      if (head) items.push(head.replace(/^["']|["']$/g, ""));
      i++;
      while (i < lines.length) {
        const cont = lines[i].match(/^\s+-\s*(.*)$/);
        if (!cont) break;
        items.push(cont[1].trim().replace(/^["']|["']$/g, ""));
        i++;
      }
      out[key] = items;
      continue;
    }
    if (!head) {
      i++;
      continue;
    }
    if (head === "true" || head === "false") {
      out[key] = head === "true";
      i++;
      continue;
    }
    out[key] = head.replace(/^["']|["']$/g, "");
    i++;
  }
  return out;
}

/** Project exactly ONE skill directory. Throws SKILL.md errors loudly. */
export function projectSkillRow(skillDir: string): SkillCatalogRow {
  const mdPath = join(skillDir, "SKILL.md");
  const md = readFileSync(mdPath, "utf8");
  const fm = parseSkillFrontmatter(md);
  if (!fm.role) {
    throw new Error(`SKILL.md at ${mdPath} is missing the required 'role:' field`);
  }
  const skillId = skillDir.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const hasRun = (() => {
    try {
      statSync(join(skillDir, "scripts", "run.ts"));
      return true;
    } catch {
      return false;
    }
  })();
  return {
    skillId,
    name: typeof fm.name === "string" ? fm.name : skillId,
    role: fm.role as SkillRole,
    description: typeof fm.description === "string" ? fm.description : "",
    triggers: Array.isArray(fm.triggers) ? fm.triggers : [],
    mutating: fm.mutating === true,
    version: typeof fm.version === "string" ? fm.version : "0.0.0",
    hasRun,
  };
}

/**
 * Project the entire catalog. Silently skips skills missing `role:` so a
 * half-tagged catalog doesn't fail M2 — the caller MUST log the skipped
 * list separately.
 */
export function projectSkillCatalog(skillsRoot: string): {
  rows: SkillCatalogRow[];
  skipped: Array<{ skillId: string; reason: string }>;
} {
  const dirs = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => !d.name.startsWith("."));
  const rows: SkillCatalogRow[] = [];
  const skipped: Array<{ skillId: string; reason: string }> = [];
  for (const d of dirs) {
    const skillDir = join(skillsRoot, d.name);
    try {
      rows.push(projectSkillRow(skillDir));
    } catch (e) {
      skipped.push({ skillId: d.name, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { rows, skipped };
}

/**
 * Bucket rows by role. Always returns all 6 keys (empty array if no skills
 * have that role). Useful for M2's first-class role routing.
 */
export function projectSkillsByRole(skillsRoot: string): Record<SkillRole, SkillCatalogRow[]> {
  const out: Record<SkillRole, SkillCatalogRow[]> = {
    worker: [],
    verifier: [],
    critic: [],
    thinker: [],
    capability: [],
    orchestrator: [],
  };
  const { rows } = projectSkillCatalog(skillsRoot);
  for (const r of rows) out[r.role].push(r);
  return out;
}

/**
 * Pick role-flavoured candidates for a given classify intent. M2's team-draft
 * default rule: for a primary intent `I`, look up the worker whose `name`
 * matches I; for hedge intents, add additional workers. Verifier/critic/
 * thinker are picked by M3 at run-team time (capabilities are tools M3
 * invokes; orchestrators are M2-process level, not per-team picks).
 */
export function projectWorkerForIntent(
  skillsRoot: string,
  intent: string,
): SkillCatalogRow | undefined {
  return projectSkillCatalog(skillsRoot).rows.find(
    (r) => r.role === "worker" && r.name.toLowerCase().includes(intent.toLowerCase()),
  );
}
