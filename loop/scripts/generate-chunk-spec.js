#!/usr/bin/env node
// generate current-chunk.md from state.json + decide-next + the markdown template.
// invoked by start-loop.sh before the tmux run.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LOOP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const statePath = path.join(LOOP_DIR, "state.json");
const templatePath = path.join(LOOP_DIR, "chunk-spec.template.md");
const outPath = path.join(LOOP_DIR, "current-chunk.md");

const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
let template = fs.readFileSync(templatePath, "utf8");

const next = spawnSync(process.execPath, [`${path.join(LOOP_DIR, "scripts", "decide-next.js")}`], { encoding: "utf8" });
if (next.status !== 0) {
  console.error(`decide-next failed: ${next.stderr || next.stdout}`);
  process.exit(2);
}
const pick = JSON.parse(next.stdout);
if (pick.done) {
  console.log(`[generate-chunk-spec] sequence complete; nothing to do.`);
  process.exit(0);
}

// scopeList is a guess-by-id; the agent reading the prompt should refine.
const id = pick.id;
const guesses = {
  "5d.1b.1": ["packages/db/src/schema.ts", "packages/db/drizzle/0012_add_customer_notification_prefs.sql", "packages/db/drizzle/meta/_journal.json", "apps/api/test/customer-prefs.test.ts"],
  "5d.1b.2": ["apps/api/src/automation/preferences.ts", "apps/api/src/routes/customers.ts", "apps/api/src/server.ts", "apps/api/test/customer-prefs.test.ts"],
  "5d.1b.3": ["apps/api/src/lib/events.ts", "apps/api/test/events.test.ts"],
  "5d.1b.4": ["apps/api/src/routes/unsubscribe.ts", "apps/api/src/server.ts", "apps/web/app/customers/[id]/page.tsx", "apps/web/components/customer-prefs.tsx", "apps/api/test/unsubscribe.test.ts"],
  "5d.2.1": ["packages/db/src/schema.ts", "packages/db/drizzle/0013_add_delivery_tracking.sql", "packages/db/drizzle/meta/_journal.json"],
  "5d.2.2": ["apps/api/src/lib/events.ts", "apps/api/test/events.test.ts"],
  "5d.2.3": ["apps/api/src/routes/webhooks.ts", "apps/api/src/server.ts", "apps/api/test/webhooks.test.ts"],
  "5d.3.1": ["packages/db/src/schema.ts", "packages/db/drizzle/0014_add_workflow_ast.sql", "packages/db/drizzle/meta/_journal.json"],
  "5d.3.2": ["packages/shared/src/workflow.ts", "packages/shared/src/index.ts", "packages/shared/test/workflow.test.ts"],
  "5d.3.3": ["apps/api/src/automation/rules.ts", "apps/api/src/lib/events.ts", "apps/api/test/automation.test.ts"],
};
const scopeList = (guesses[id] || ["read decide-next output, infer from the goal"]).join("\n- ");

const minNewTests = id.endsWith(".1") || id.endsWith(".2") || id.endsWith(".3") || id === "8c" ? 2 : 1;
const fromStatus = id.startsWith("5d.") ? "🔴 → 🟢" : "🔴 → 🟡";
const toStatus = id.startsWith("5d.") ? "🟢" : "🟡";
const surfaceSection = id.startsWith("5d.1b") ? "Phase 5d in queue / Customer preferences" :
  id.startsWith("5d.2")  ? "Phase 5d in queue / 5. Delivery analytics plumbing" :
  id.startsWith("5d.3")  ? "Phase 5d in queue / Visual workflow builder" :
  id.startsWith("6")     ? "1. Scheduling & Dispatch" :
  id.startsWith("7")     ? "7. Field Service Mobile App (time)" :
  id.startsWith("8")     ? "12. Customer Self-Service Portal" :
  id.startsWith("9")     ? "Growth & Admin" :
  id.startsWith("10")    ? "Polish & Advanced" : "Audit Matrix";

template = template
  .replace("{{ phaseLabel }}", pick.phaseLabel)
  .replace("{{ stepTitle }}", pick.stepTitle)
  .replace("{{ goal }}", pick.goal)
  .replace("{{ surfaceSection }}", surfaceSection)
  .replace("{{ fromStatus }}", fromStatus)
  .replace("{{ toStatus }}", toStatus)
  .replace("{{ scopeList }}", `- ${scopeList}`)
  .replace("{{ minNewTests }}", String(minNewTests))
  .replace(/{{ phaseNumber }}/g, id[0])
  .replace(/{{ subLetter }}/g, id.slice(1, 2) || "")
  .replace(/{{ shortVerb }}/g, "add")
  .replace(/{{ nounPhrase }}/g, pick.stepTitle.split(" ").slice(0, 4).join(" ").toLowerCase());

fs.writeFileSync(outPath, template);
state.currentPhase = pick.id;
state.stepIndex = 0;
state.status = "drafting";
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log(`[generate-chunk-spec] wrote ${outPath} for ${pick.id}`);
