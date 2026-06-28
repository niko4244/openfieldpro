// =============================================================================
// apps/api/src/answer/prompts/classify.ts
// -----------------------------------------------------------------------------
// Conductor classifier — the first hop of POST /api/answer.
//
// Feeds a free-text user prompt to qwen3-coder:480b-cloud (Ollama :11434) with
// a strict-JSON system prompt and parses the response back into a typed intent.
//
// Designed for: 1 round-trip per request, <500ms tokens, no streaming.
//
// Design choices:
//   • Domain-of-the-ask, NOT linguistic form, drives the intent. "Build me a
//     Polymarket backtester" is trading (primary) + coding (secondary), not
//     coding — even though every word is technical.
//   • qwen-coder biases toward "coding" — pinned with explicit negative
//     examples in the system prompt so the model doesn't reflex-classify.
//   • JSON-mode via Ollama response_format:{type:"json_object"} works but
//     the runtime wraps output in ```json fences. We strip fences before
//     parsing — the parser is the source of truth, not the model.
//   • Optional `hedge[]` lets the conductor pick a 2-skill team when the
//     prompt is genuinely mixed-domain (no tiebreaker blind spot).
// ponytail: kept the DTO intentionally flat — no nested metadata, no
//   id-of-classification token, no signature for v0. If the conductor wants
//   a trace later, log `meta.input_sha` as part of the audit record.
//   Ceiling: when tracing becomes a real requirement (debugging why a
//   user-facing answer felt off), add a `meta` block. Upgrade: schema.
// =============================================================================

import { z } from "zod";

// ---------- 1. Intent union + output schema --------------------------------

export const CLASSIFY_INTENTS = ["coding", "trading", "mining", "research", "unknown"] as const;
export type ClassifyIntent = (typeof CLASSIFY_INTENTS)[number];

// ponytail: zod's default strips-but-doesn't-fail on extras; we want loud
//   failures when the model starts emitting fields we haven't designed for.
//   Ceiling: a nested metadata shape (e.g. reasoning traces) would force
//   ad-hoc key-walking. Upgrade: a discriminated union once the wire-shape
//   stabilises across two consecutive minor versions.
export const ClassifyResultSchema = z
  .object({
    intent: z.enum(CLASSIFY_INTENTS),
    /* confidence is encoded as a 0..1 number. The model is asked for 2
       decimals so `"0.94"` round-trips. Strings/percentages are rejected.
       Transform clamps to exactly 2 decimals so downstream logging and
       conductor routing always see the same precision. */
    confidence: z
      .number()
      .min(0)
      .max(1)
      .transform((v) => Math.round(v * 100) / 100),
    /* ≤ 200 chars per the system prompt; we *also* enforce parser-side to
       catch regressions where the model writes 4 KB of rationale. */
    rationale: z.string().min(1).max(240),
    /* Secondary intents if the prompt is mixed-domain. Default empty. */
    hedge: z.array(z.enum(CLASSIFY_INTENTS)).max(2).default([]),
  })
  .strict();
export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;

// ---------- 2. System prompt (the actual conditioning) ---------------------
// Kept as a single string constant — it lives next to the schema so any
// change to the schema also surfaces here during review.

export const CLASSIFY_SYSTEM_PROMPT = `# Conductor router.

You classify ONE free-text user prompt into exactly one primary intent.
The DOMAIN of the ask — not the form of the words — drives the intent.

OUTPUT (no preamble, no markdown, no commentary):
{"intent": "coding"|"trading"|"mining"|"research"|"unknown",
 "confidence": 0.00..1.00, two decimals,
 "rationale": "one short sentence, ≤ 200 chars",
 "hedge": ["<secondary intent>", ...]}

CATEGORIES
- coding    writing/debugging/refactoring/testing code, scripts, configs, infra-as-code. Output deliverable is code.
- trading   financial-market ops — equities, options, prediction markets, IPOs, position sizing, market timing.
- mining    crypto-mining economics & ops — hashrate, difficulty, miner profitability, fleet, energy.
- research  open-ended info gathering — papers, briefings, summaries, fact-finding, web lookups.
- unknown   anything clearly off-axis (greetings, chitchat, vague) OR genuinely cross-domain with no clear primary.

CONFIDENCE CALIBRATION
0.85..1.00  obvious single-domain
0.65..0.85  mostly single-domain with a touch of cross-domain flavor
0.40..0.65  primary with a notable secondary — capture secondary in \`hedge\`
(the < 0.40 band rule lives in BELOW-THRESHOLD below — do not restate)

BELOW-THRESHOLD (the SINGLE owner of the < 0.40 threshold)
When the prompt is cross-domain with no clear primary, OR genuinely
ambiguous, OR two domains are genuinely co-primary (neither dominant),
emit:
- \`intent\` = "unknown"
- \`confidence\` < 0.40
- \`hedge\` = both intents (max 2)
This prevents the team-draft map from anchoring on whichever domain the
model mentions first in its rationale.

ANTI-OVER-CLASSIFICATION (you are coder-trained; counter-bias here)
- "what's the SOL price right now?"                → trading
- "is BTC mining profitable at 980 EH/s?"          → mining
- "summarize the latest FOMC minutes"              → research
- "should I buy AAPL before earnings?"             → trading
- "refactor this Rust trait"                       → coding
- "explain how sha256d works in mining"            → mining
- "find Rust crates for market-data feeds"         → research (NOT coding — the ask is "find")
- "write a script to call Polymarket's API"        → trading (primary) + coding (hedge)
- "deploy a backtester to AWS Lambda"              → coding (primary) + trading (hedge)

OUTPUT ONLY THE JSON OBJECT. No prose, no fences, no \`\`\`.`;

// ---------- 3. Builders -----------------------------------------------------

/** Builds the {system, user} message pair sent to /v1/chat/completions.
 *  Pure function — same input → same output, stable for snapshot testing. */
export function buildClassifyMessages(input: string): ReadonlyArray<{
  readonly role: "system" | "user";
  readonly content: string;
}> {
  return [
    { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Classify this user prompt. Reply with ONLY the JSON object.\n` +
        `USER PROMPT:\n<<<${input || ""}>>>`,
    },
  ];
}

// ---------- 4. Parser -------------------------------------------------------

/** Strip ```json / ``` / ```JSON fences that Ollama wraps around response_format
 *  output. Case-insensitive on the language tag. Idempotent. */
export function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:[Jj][Ss][Oo][Nn])?\s*([\s\S]*?)\s*```$/);
  if (fenced && fenced[1]) return fenced[1].trim();
  return trimmed;
}

/** Try to parse a model completion into a ClassifyResult. Returns either the
 *  validated result OR a structured error envelope — never throws, so callers
 *  can branch without try/catch noise. */
export function tryParseClassify(
  raw: string,
): { ok: true; value: ClassifyResult } | { ok: false; error: string } {
  const noFences = stripJsonFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(noFences);
  } catch (e) {
    return { ok: false, error: `json parse failed: ${(e as Error).message}` };
  }
  const result = ClassifyResultSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: `schema validation failed: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }
  return { ok: true, value: result.data };
}
