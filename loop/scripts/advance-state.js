#!/usr/bin/env node
// advance-state.js: invoked by start-loop.sh after Claude Code exits.
// Records the run's outcome in state.json::history and picks the next step.

import fs from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";

const LOOP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const statePath = path.join(LOOP_DIR, "state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));

const arg = process.argv[2]; // --success or --fail

if (!["--success", "--fail"].includes(arg)) {
  console.error(`usage: advance-state.js --success|--fail`);
  process.exit(2);
}

const id = state.currentPhase;
state.history.push({
  id,
  status: arg === "--success" ? "success" : "failure",
  at: new Date().toISOString(),
  commit: process.env.LAST_COMMIT || null,
});
state.status = arg === "--success" ? "next-pending" : "stuck";
state.lastRunAt = new Date().toISOString();
state.lastExitCode = arg === "--success" ? 0 : 1;
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log(`[advance-state] ${id} → ${arg === "--success" ? "success" : "failure"}; history length ${state.history.length}`);
