// =============================================================================
// apps/api/test/answer.skills.role-projection.test.ts
// -----------------------------------------------------------------------------
// Offline unit tests for the skill role projector. Pure: each test builds a
// tmp SKILL.md fixture and asserts how the projector parses + projects it.
// No filesystem walks outside the tmp dir.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseSkillFrontmatter,
  projectSkillRow,
  projectSkillCatalog,
  projectSkillsByRole,
  projectWorkerForIntent,
  SkillCatalogRowSchema,
  SKILL_ROLES,
} from "../src/answer/skills/role-projection.ts";

// ---------- helpers ---------------------------------------------------------

function makeSkill(root: string, name: string, role: string, mutating = false) {
  const d = join(root, name);
  mkdirSync(d, { recursive: true });
  writeFileSync(
    join(d, "SKILL.md"),
    `---
name: ${name}
version: 1.0.0
role: ${role}
description: ${name} does ${role} things.
triggers:
  - "${name}"
  - "trigger-for-${name}"
mutating: ${mutating ? "true" : "false"}
---
# ${name}
body ignored by the projector.
`,
  );
  return d;
}

function cleanup(root: string) {
  rmSync(root, { recursive: true, force: true });
}

// ---------- parseSkillFrontmatter ------------------------------------------

test("parseSkillFrontmatter extracts scalars, booleans, block-lists verbatim", () => {
  const md = `---
name: foo
version: 1.2.3
description: "quoted value"
mutating: true
triggers:
  - "alpha"
  - "beta"
  - "gamma"
---
# body
`;
  const fm = parseSkillFrontmatter(md);
  assert.equal(fm.name, "foo");
  assert.equal(fm.version, "1.2.3");
  assert.equal(fm.description, "quoted value");
  assert.equal(fm.mutating, true);
  assert.deepEqual(fm.triggers, ["alpha", "beta", "gamma"]);
});

test("parseSkillFrontmatter handles inline list values", () => {
  const md = `---
triggers: ["a", "b", "c"]
---
`;
  const fm = parseSkillFrontmatter(md);
  assert.deepEqual(fm.triggers, ["a", "b", "c"]);
});

test("parseSkillFrontmatter throws on missing frontmatter", () => {
  assert.throws(() => parseSkillFrontmatter("# no frontmatter here\n"));
});

// ---------- projectSkillRow ------------------------------------------------

test("projectSkillRow emits SkillCatalogRow with all 6 valid roles accepted", () => {
  for (const role of SKILL_ROLES) {
    const root = mkdtempSync(join(tmpdir(), "ofp-rp-"));
    try {
      const d = makeSkill(root, `skill-${role}`, role, role !== "verifier");
      const row = projectSkillRow(d);
      assert.equal(row.skillId, `skill-${role}`);
      assert.equal(row.role, role);
      assert.equal(row.mutating, role !== "verifier");
      assert.equal(row.description, `skill-${role} does ${role} things.`);
      // Schema validation passes
      SkillCatalogRowSchema.parse(row);
    } finally {
      cleanup(root);
    }
  }
});

test("projectSkillRow throws when SKILL.md is missing the role: field", () => {
  const root = mkdtempSync(join(tmpdir(), "ofp-rp-"));
  try {
    const d = join(root, "no-role");
    mkdirSync(d);
    writeFileSync(
      join(d, "SKILL.md"),
      `---
name: no-role
version: 0.1.0
description: missing role field.
---
`,
    );
    assert.throws(() => projectSkillRow(d), /missing the required 'role:' field/);
  } finally {
    cleanup(root);
  }
});

test("projectSkillRow reports hasRun=true only if scripts/run.ts exists", () => {
  const root = mkdtempSync(join(tmpdir(), "ofp-rp-"));
  try {
    const dNoRun = makeSkill(root, "no-run", "worker", false);
    assert.equal(projectSkillRow(dNoRun).hasRun, false);

    const dWithRun = makeSkill(root, "with-run", "worker", true);
    mkdirSync(join(dWithRun, "scripts"));
    writeFileSync(join(dWithRun, "scripts", "run.ts"), "// stub\n");
    assert.equal(projectSkillRow(dWithRun).hasRun, true);
  } finally {
    cleanup(root);
  }
});

// ---------- projectSkillCatalog -------------------------------------------

test("projectSkillCatalog returns one row per directory + a skipped list", () => {
  const root = mkdtempSync(join(tmpdir(), "ofp-rp-"));
  try {
    makeSkill(root, "alpha", "worker", true);
    makeSkill(root, "beta", "verifier", false);
    makeSkill(root, "gamma-no-role", "X", false);
    // rewrite gamma to actually miss the role
    const gDir = join(root, "gamma-no-role");
    writeFileSync(
      join(gDir, "SKILL.md"),
      `---
name: gamma-no-role
version: 0.0.1
description: no role here.
---
`,
    );

    const { rows, skipped } = projectSkillCatalog(root);
    assert.equal(rows.length, 2);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].skillId, "gamma-no-role");
    assert.match(skipped[0].reason, /missing the required 'role:' field/);
  } finally {
    cleanup(root);
  }
});

test("projectSkillCatalog ignores dotted-prefix directories", () => {
  const root = mkdtempSync(join(tmpdir(), "ofp-rp-"));
  try {
    makeSkill(root, "real-skill", "worker", false);
    mkdirSync(join(root, ".hidden"));
    writeFileSync(
      join(root, ".hidden", "SKILL.md"),
      `---
name: hidden
version: 0.0.0
role: worker
description: hidden skill
---
`,
    );
    const { rows } = projectSkillCatalog(root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].skillId, "real-skill");
  } finally {
    cleanup(root);
  }
});

// ---------- projectSkillsByRole --------------------------------------------

test("projectSkillsByRole buckets rows by all 6 roles (empty buckets for none)", () => {
  const root = mkdtempSync(join(tmpdir(), "ofp-rp-"));
  try {
    makeSkill(root, "w1", "worker", false);
    makeSkill(root, "w2", "worker", false);
    makeSkill(root, "v1", "verifier", false);
    makeSkill(root, "c1", "critic", false);
    const bucketed = projectSkillsByRole(root);
    assert.equal(bucketed.worker.length, 2);
    assert.equal(bucketed.verifier.length, 1);
    assert.equal(bucketed.critic.length, 1);
    assert.equal(bucketed.thinker.length, 0);
    assert.equal(bucketed.capability.length, 0);
    assert.equal(bucketed.orchestrator.length, 0);
    // the union equals what projectSkillCatalog returns
    const total =
      bucketed.worker.length +
      bucketed.verifier.length +
      bucketed.critic.length +
      bucketed.thinker.length +
      bucketed.capability.length +
      bucketed.orchestrator.length;
    assert.equal(total, 4);
  } finally {
    cleanup(root);
  }
});

// ---------- projectWorkerForIntent ----------------------------------------

test("projectWorkerForIntent finds a worker whose name includes the intent", () => {
  const root = mkdtempSync(join(tmpdir(), "ofp-rp-"));
  try {
    makeSkill(root, "mining-ops-bot", "worker", true);
    makeSkill(root, "researcher", "worker", false);
    const r1 = projectWorkerForIntent(root, "mining");
    assert.ok(r1);
    assert.equal(r1!.skillId, "mining-ops-bot");
    const r2 = projectWorkerForIntent(root, "research");
    assert.ok(r2);
    assert.equal(r2!.skillId, "researcher");
    const r3 = projectWorkerForIntent(root, "nope");
    assert.equal(r3, undefined);
  } finally {
    cleanup(root);
  }
});

test("projectWorkerForIntent never picks a non-worker (no verifiers/thinkers returned)", () => {
  const root = mkdtempSync(join(tmpdir(), "ofp-rp-"));
  try {
    makeSkill(root, "thinking-patterns", "thinker", false); // name contains "thinking"
    const r = projectWorkerForIntent(root, "thinking");
    assert.equal(r, undefined, "thinkers must not be returned by the worker-for-intent projection");
  } finally {
    cleanup(root);
  }
});
