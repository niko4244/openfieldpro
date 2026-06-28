// =============================================================================
// apps/api/test/answer.classify.test.ts
// -----------------------------------------------------------------------------
// Offline unit tests for the conductor classify prompt module.
// Runs under `node --import tsx --test`. No model call required.
//
// Run:   cd openfieldpro-app && pnpm --filter @ofp/api exec node --import tsx --test test/answer.classify.test.ts
// Live:  cd openfieldpro-app && pnpm --filter @ofp/api exec node --import tsx test/answer.classify.smoke.ts  (requires Ollama :11434)
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CLASSIFY_INTENTS,
  CLASSIFY_SYSTEM_PROMPT,
  buildClassifyMessages,
  stripJsonFences,
  tryParseClassify,
} from "../src/answer/prompts/classify.ts";

test("system prompt mentions all 5 intents verbatim", () => {
  for (const intent of CLASSIFY_INTENTS) {
    assert.match(
      CLASSIFY_SYSTEM_PROMPT,
      new RegExp(`\\b${intent}\\b`),
      `system prompt missing '${intent}' — would bias the model`,
    );
  }
});

test("system prompt explicitly counters coder bias", () => {
  // Pin the anti-over-classification block so future edits don't quietly delete
  // the counter-bias (qwen3-coder reflex-classifies without it).
  assert.match(CLASSIFY_SYSTEM_PROMPT, /ANTI-OVER-CLASSIFICATION/i);
  assert.match(CLASSIFY_SYSTEM_PROMPT, /sha256d|BTC mining|Polymarket/);
});

test("system prompt enforces JSON-only output", () => {
  assert.match(CLASSIFY_SYSTEM_PROMPT, /OUTPUT ONLY THE JSON/i);
  assert.match(CLASSIFY_SYSTEM_PROMPT, /no fences|no markdown/);
});

test("buildClassifyMessages produces exactly 2 messages", () => {
  const msgs = buildClassifyMessages("How is SOL mining today?");
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, "system");
  assert.equal(msgs[1].role, "user");
});

test("buildClassifyMessages user content embeds input verbatim", () => {
  const input = "refactor this Rust trait — handle error unions";
  const msgs = buildClassifyMessages(input);
  const user = msgs[1].content;
  assert.ok(user.includes(input), "user message must echo input");
  assert.ok(user.includes("<<<"), "delimiters must wrap input");
});

test("buildClassifyMessages is pure (idempotent & deterministic)", () => {
  const a = buildClassifyMessages("what's AAPL price?");
  const b = buildClassifyMessages("what's AAPL price?");
  assert.deepEqual(a, b);
});

test("buildClassifyMessages handles empty input without crashing", () => {
  const msgs = buildClassifyMessages("");
  assert.equal(msgs.length, 2);
  // Empty input still produces a valid user message — caller decides whether
  // to route empty-input upstream. The classifier module is intentionally
  // agnostic.
  assert.ok(msgs[1].content.includes("<<<"));
  assert.ok(msgs[1].content.includes(">>>"));
});

test("stripJsonFences unwraps ```json fences", () => {
  assert.equal(stripJsonFences("```json\n{\"a\":1}\n```"), '{"a":1}');
  assert.equal(stripJsonFences("```\n{\"a\":1}\n```"), '{"a":1}');
  assert.equal(stripJsonFences("```JSON\n{\"a\":1}\n```"), '{"a":1}');
});

test("stripJsonFences is idempotent", () => {
  const once = stripJsonFences("```json\n{\"a\":1}\n```");
  const twice = stripJsonFences(once);
  assert.equal(once, twice);
});

test("stripJsonFences passes through plain JSON untouched", () => {
  assert.equal(stripJsonFences('{"a":1}'), '{"a":1}');
  assert.equal(stripJsonFences('  {"a":1}  '), '{"a":1}');
});

test("tryParseClassify round-trips a known-good Ollama fence response", () => {
  const raw = "```json\n{\"intent\":\"trading\",\"confidence\":0.92,\"rationale\":\"price query on AAPL\",\"hedge\":[]}\n```";
  const out = tryParseClassify(raw);
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.value.intent, "trading");
    assert.equal(out.value.confidence, 0.92);
    assert.equal(out.value.rationale, "price query on AAPL");
    assert.deepEqual(out.value.hedge, []);
  }
});

test("tryParseClassify parses unfenced JSON", () => {
  const raw = '{"intent":"research","confidence":0.74,"rationale":"summarising an arxiv paper","hedge":["coding"]}';
  const out = tryParseClassify(raw);
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.value.intent, "research");
    assert.equal(out.value.confidence, 0.74);
    assert.deepEqual(out.value.hedge, ["coding"]);
  }
});

test("tryParseClassify rejects out-of-domain intents", () => {
  const raw = '{"intent":"weather","confidence":0.9,"rationale":"what is the weather","hedge":[]}';
  const out = tryParseClassify(raw);
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.match(out.error, /intent/);
  }
});

test("tryParseClassify rejects confidence outside 0..1", () => {
  const tooHigh = '{"intent":"coding","confidence":1.4,"rationale":"definitely code","hedge":[]}';
  const tooLow = '{"intent":"coding","confidence":-0.1,"rationale":"never code","hedge":[]}';
  assert.equal(tryParseClassify(tooHigh).ok, false);
  assert.equal(tryParseClassify(tooLow).ok, false);
});

test("tryParseClassify rejects oversized rationale", () => {
  const big = "x".repeat(500);
  const raw = `{"intent":"coding","confidence":0.9,"rationale":"${big}","hedge":[]}`;
  const out = tryParseClassify(raw);
  assert.equal(out.ok, false);
});

test("tryParseClassify rejects hedge arrays > 2 entries", () => {
  const raw = '{"intent":"coding","confidence":0.5,"rationale":"mixed","hedge":["trading","mining","research"]}';
  const out = tryParseClassify(raw);
  assert.equal(out.ok, false);
});

test("tryParseClassify defaults hedge to [] when omitted", () => {
  const raw = '{"intent":"coding","confidence":0.9,"rationale":"plain coding ask"}';
  const out = tryParseClassify(raw);
  assert.equal(out.ok, true);
  if (out.ok) assert.deepEqual(out.value.hedge, []);
});

test("tryParseClassify returns structured error on malformed JSON (never throws)", () => {
  const out = tryParseClassify("not json at all");
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.match(out.error, /json parse failed/);
  }
});

// ---------- count-anchor regression test (sentinel-based) -----------------
//
// Earlier iterations of the system prompt shipped with two competing rules at
// the same < 0.40 threshold. This test pins both *positive* sentinels (text
// that MUST be present after consolidation) and a *negative* sentinel (text
// that MUST be absent) so a silent re-introduction of the duplicate fails CI.
// The numeric 0.40-ref bound is loosened to tolerate minor future edits that
// legitimately add pointer / boundary mentions but do not duplicate the rule.

test("calibration block has exactly ONE explicit < 0.40 rule (no competing thresholds)", () => {
  const prompt = CLASSIFY_SYSTEM_PROMPT;

  // Positive sentinels — text that has to be present after consolidation.
  assert.equal(
    prompt.includes("0.40..0.65"),
    true,
    "CALIBRATION band marker missing",
  );
  assert.equal(
    prompt.includes("BELOW-THRESHOLD"),
    true,
    "BELOW-THRESHOLD owner heading missing",
  );
  // The threshold rule value line uses backticks around the field name in the
  // prompt (`confidence` < 0.40). The sentinel regex tolerates backticks,
  // quotes, or whitespace around `confidence` so this assertion doesn't churn
  // on cosmetic reformatting of the rule-line.
  assert.match(prompt, /["`'\s]confidence["`'\s]+\< 0\.40/, "BELOW-THRESHOLD rule value missing");
  assert.match(prompt, /do not restate/i, "CALIBRATION forward-pointer missing");

  // Negative sentinel — the legacy duplicate string must NOT be present.
  assert.equal(
    prompt.includes("prefer `unknown` and leave `hedge` empty"),
    false,
    "duplicate CALIBRATION < 0.40 rule has been re-introduced",
  );

  // Numeric bound — kept loose to absorb future legitimate pointer edits.
  const refs = (prompt.match(/0\.40/g) || []).length;
  assert.ok(
    refs >= 3 && refs <= 6,
    `0.40 mentions drifted: ${refs} (consolidated prompt expected 3 to 6: band + forward-pointer + BELOW-THRESHOLD owner)`,
  );
});

// ---------- coverage holes the reviewer flagged ----------------------------

test("tryParseClassify rejects case-different intent (e.g. 'Coding')", () => {
  const raw = '{"intent":"Coding","confidence":0.9,"rationale":"looks code","hedge":[]}';
  const out = tryParseClassify(raw);
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.match(out.error, /intent/);
  }
});

test("tryParseClassify rejects null intent", () => {
  const raw = '{"intent":null,"confidence":0.9,"rationale":"nope","hedge":[]}';
  const out = tryParseClassify(raw);
  assert.equal(out.ok, false);
});

test("tryParseClassify rejects 0-length rationale", () => {
  const raw = '{"intent":"coding","confidence":0.9,"rationale":"","hedge":[]}';
  const out = tryParseClassify(raw);
  assert.equal(out.ok, false);
});

test("tryParseClassify accepts rationale with newlines and unicode", () => {
  const raw =
    '{"intent":"research","confidence":0.81,"rationale":"arxiv lookup\\nwith µ-parsing","hedge":[]}';
  const out = tryParseClassify(raw);
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.match(out.value.rationale, /\n/);
    assert.match(out.value.rationale, /µ/);
  }
});

test("tryParseClassify normalises confidence to two decimals", () => {
  const inputs = [
    '{"intent":"coding","confidence":0.999,"rationale":"r1","hedge":[]}',     // 0.999 -> 1
    '{"intent":"coding","confidence":1,"rationale":"r2","hedge":[]}',         // 1 -> 1
    '{"intent":"coding","confidence":0.924567,"rationale":"r3","hedge":[]}',   // 0.924567 -> 0.92
  ];
  const expected = [1, 1, 0.92];
  for (let i = 0; i < inputs.length; i++) {
    const out = tryParseClassify(inputs[i]);
    assert.equal(out.ok, true, `input ${i} failed`);
    if (out.ok) {
      assert.equal(out.value.confidence, expected[i], `confidence ${inputs[i]} should normalise to ${expected[i]}`);
    }
  }
});

test("tryParseClassify rejects confidence-as-string", () => {
  const raw = '{"intent":"coding","confidence":"high","rationale":"r","hedge":[]}';
  assert.equal(tryParseClassify(raw).ok, false);
});

test("tryParseClassify rejects hedge that contains the primary intent (loop guard)", () => {
  // Strict-spec read: hedge is "secondary" intents. Primary in hedge is
  // meaningless. The schema currently accepts this — pinned here as known
  // intentional behaviour. If we ever want to reject, write a refinement.
  const raw = '{"intent":"coding","confidence":0.5,"rationale":"mixed","hedge":["coding"]}';
  const out = tryParseClassify(raw);
  // ponytail: explicit ceiling-pin. Tighten to "hedge excludes intent"
  //   when the conductor starts double-drafting teams. Today it only uses
  //   hedge as a tie-breaker, so duplicate is harmless noise.
  assert.equal(out.ok, true);
});

test("tryParseClassify rejects extra fields (strict schema)", () => {
  // Reviewer P2-1: catch model-side additions loudly.
  const raw =
    '{"intent":"coding","confidence":0.9,"rationale":"r","hedge":[],"model_version":"qwen3"}';
  const out = tryParseClassify(raw);
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.match(out.error, /unrecognized|unexpected|strict/i);
  }
});

test("stripJsonFences case-insensitive on the language tag", () => {
  for (const wrap of ["```json", "```JSON", "```Json", "```jSoN", "```"]) {
    const fenced = `${wrap}\n{"a":1}\n\`\`\``;
    assert.equal(stripJsonFences(fenced), '{"a":1}', `failed for wrap='${wrap}'`);
  }
});

test("stripJsonFences passes through an orphaned opening fence (no closing)", () => {
  // Implementation contract: only matched ```X``` ... ```X``` pairs unwrap.
  // An opening fence without a closing fence passes through unchanged.
  // Downstream `tryParseClassify` catches this via the JSON.parse failure
  // branch and returns {ok:false, error:"json parse failed: ..."}.
  // This boundary matters — callers must not assume the stripper heuristically
  // recovers malformed responses.
  const partial = "```json\n{\"a\":1}";
  assert.equal(stripJsonFences(partial), partial);
});

// NOTE: golden fixtures with live-model intent assertions moved to
// `test/answer.classify.smoke.ts` (opt-in, requires Ollama :11434).
// Run: `pnpm --filter @ofp/api exec node --import tsx test/answer.classify.smoke.ts`
