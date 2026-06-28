// =============================================================================
// apps/api/test/answer.classify.smoke.ts
// -----------------------------------------------------------------------------
// OPT-IN live smoke test for the conductor classify prompt.
//
// REQUIRES: Ollama running at http://localhost:11434 with `qwen3-coder:480b-cloud`
// installed. This file does NOT register with the node:test runner (no .test.ts
// suffix) — invoke it manually:
//
//   cd openfieldpro-app && pnpm --filter @ofp/api exec node --import tsx test/answer.classify.smoke.ts
//
// Behavior:
//   * If Ollama is unreachable → exits 0 with a SKIP line (don't fail CI offline).
//   * If Ollama is reachable → exits:
//       0   if every fixture produced the expected intent
//       1   if any fixture mismatched
//
// ASCII-only output to avoid Windows console codepage 1252 errors.
// =============================================================================

import {
  buildClassifyMessages,
  tryParseClassify,
  type ClassifyIntent,
} from "../src/answer/prompts/classify.ts";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.CLASSIFY_MODEL ?? "qwen3-coder:480b-cloud";

interface Golden {
  input: string;
  intent: ClassifyIntent;
}

const GOLDEN: ReadonlyArray<Golden> = [
  { input: "write a Python function to parse Polymarket JSON responses", intent: "coding" },
  { input: "what's the price of SOL right now on Coinbase?", intent: "trading" },
  {
    input:
      "is BTC mining profitable at 980 EH/s with a +7% difficulty retarget coming in 1.1 days?",
    intent: "mining",
  },
  { input: "summarize arxiv:2503.12345 — what's the headline result?", intent: "research" },
  { input: "hi there, just checking in", intent: "unknown" },
];

async function fetchClassify(prompt: string): Promise<string> {
  const messages = buildClassifyMessages(prompt).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer ollama",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 200,
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from Ollama: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return body.choices[0].message.content;
}

async function ollamaReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${OLLAMA_URL}/v1/models`, {
      headers: { Authorization: "Bearer ollama" },
      signal: AbortSignal.timeout(2000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log(`  endpoint:           ${OLLAMA_URL}/v1/chat/completions`);
  console.log(`  model:              ${MODEL}`);
  console.log(`  fixtures:           ${GOLDEN.length}`);
  console.log();
  console.log(
    `  ${"idx"}  ${"expected"}  ${"got"}  ${"conf"}  ${"ok"}  ${"rationale"}`,
  );
  console.log(
    `  ${"-".repeat(3)}  ${"-".repeat(8)}  ${"-".repeat(8)}  ${"-".repeat(4)}  ${"-".repeat(2)}  ${"-".repeat(60)}`,
  );

  if (!(await ollamaReachable())) {
    console.log();
    console.log(`  SKIP — Ollama not reachable at ${OLLAMA_URL}.`);
    console.log(`         Run: ollama serve && ollama pull ${MODEL}`);
    process.exit(0);
  }

  let passCount = 0;
  let fenceHits = 0;
  for (let i = 0; i < GOLDEN.length; i++) {
    const fixture = GOLDEN[i];
    try {
      const raw = await fetchClassify(fixture.input);
      const containsFence = raw.trim().startsWith("```");
      if (containsFence) fenceHits++;
      const out = tryParseClassify(raw);
      if (!out.ok) {
        console.log(
          `  ${String(i + 1).padStart(3)}  ${fixture.intent.padEnd(8)}  ${"ERR".padEnd(8)}  ${"-".padEnd(4)}  XX  ${out.error.slice(0, 60)}`,
        );
        continue;
      }
      const ok = out.value.intent === fixture.intent;
      if (ok) passCount++;
      const mark = ok ? "ok" : "XX";
      console.log(
        `  ${String(i + 1).padStart(3)}  ${fixture.intent.padEnd(8)}  ${out.value.intent.padEnd(8)}  ${String(out.value.confidence).padEnd(4)}  ${mark.padEnd(2)}  ${out.value.rationale.slice(0, 60)}`,
      );
    } catch (e) {
      console.log(
        `  ${String(i + 1).padStart(3)}  ${fixture.intent.padEnd(8)}  ${"EXC".padEnd(8)}  ${"-".padEnd(4)}  XX  ${(e as Error).message.slice(0, 60)}`,
      );
    }
  }

  console.log();
  console.log(
    `  result: ${passCount}/${GOLDEN.length} fixtures produced expected intent`,
  );
  console.log(
    `  fence:  ${fenceHits}/${GOLDEN.length} responses were code-fenced (handled by stripJsonFences)`,
  );

  process.exit(passCount === GOLDEN.length ? 0 : 1);
}

main();
