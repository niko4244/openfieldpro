// Phase 7 dispatch unit check — pure helpers, no DB. Run with
//   node --import tsx --test test/dispatch.test.ts
// from apps/api.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  _resetThrottle,
  freshnessTier,
  isValidAccuracy,
  isValidLatLng,
  releasePing,
  reservePing,
} from "../src/dispatch.ts";

test("freshnessTier — boundaries", () => {
  const now = new Date("2026-06-30T12:00:00Z");
  const ago = (seconds: number) =>
    new Date(now.getTime() - seconds * 1000);

  assert.equal(freshnessTier(ago(30), now), "live");
  assert.equal(freshnessTier(ago(119), now), "live"); // < 2m
  assert.equal(freshnessTier(ago(120), now), "recent"); // exactly 2m → recent
  assert.equal(freshnessTier(ago(29 * 60), now), "recent"); // < 30m
  assert.equal(freshnessTier(ago(30 * 60), now), "stale"); // exactly 30m
  assert.equal(freshnessTier(ago(119 * 60), now), "stale"); // < 2h
  assert.equal(freshnessTier(ago(2 * 60 * 60), now), "dead"); // exactly 2h
  assert.equal(freshnessTier(ago(36 * 60 * 60), now), "dead");
});

test("freshnessTier — small future skew is live; far future is dead", () => {
  const now = new Date("2026-06-30T12:00:00Z");
  // Clock-skewed-but-reasonable: phone 5s ahead. Tolerated.
  const slightFuture = new Date(now.getTime() + 5_000);
  assert.equal(freshnessTier(slightFuture, now), "live");
  // Wildly-skewed: phone 2 hours ahead. Treated as dead so the dispatcher
  // doesn't trust a stale phantom-dot forever.
  const farFuture = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  assert.equal(freshnessTier(farFuture, now), "dead");
  // Right at the 1h clamp boundary: still dead.
  const atBoundary = new Date(now.getTime() + 60 * 60 * 1000);
  assert.equal(freshnessTier(atBoundary, now), "dead");
});

test("isValidLatLng — happy path", () => {
  assert.equal(isValidLatLng(40.7128, -74.006), true);
  assert.equal(isValidLatLng(0, 0), true);
  assert.equal(isValidLatLng(-90, -180), true);
  assert.equal(isValidLatLng(90, 180), true);
});

test("isValidLatLng — reject NaN, Infinity, out-of-range", () => {
  assert.equal(isValidLatLng(91, 0), false);
  assert.equal(isValidLatLng(-91, 0), false);
  assert.equal(isValidLatLng(0, 181), false);
  assert.equal(isValidLatLng(0, -181), false);
  assert.equal(isValidLatLng(NaN, 0), false);
  assert.equal(isValidLatLng(0, NaN), false);
  assert.equal(isValidLatLng(Infinity, 0), false);
});

test("isValidAccuracy — undefined/null OK; bounds checked", () => {
  assert.equal(isValidAccuracy(undefined), true);
  assert.equal(isValidAccuracy(null), true);
  assert.equal(isValidAccuracy(0), true);
  assert.equal(isValidAccuracy(5), true);
  assert.equal(isValidAccuracy(49_999), true);
  assert.equal(isValidAccuracy(50_000), true);
  assert.equal(isValidAccuracy(50_001), false);
  assert.equal(isValidAccuracy(-1), false);
  assert.equal(isValidAccuracy(NaN), false);
});

test("reservePing — atomic check+stamp; concurrent second peek is rejected", () => {
  _resetThrottle();
  const t0 = 2_500_000;
  // First reserve — accept and stamps.
  assert.deepEqual(reservePing("u1", t0), { accept: true, retryAfterMs: 0 });
  // Concurrent second reserve at the SAME instant is rejected because the
  // first atomic Map.set() is visible to the second map lookup.
  const blocked = reservePing("u1", t0);
  assert.equal(blocked.accept, false);
  // After the floor passes, accept again.
  assert.deepEqual(reservePing("u1", t0 + 5_001), { accept: true, retryAfterMs: 0 });
});

test("releasePing — clears the slot so the next reservePing passes", () => {
  _resetThrottle();
  const t0 = 3_000_000;
  assert.deepEqual(reservePing("u1", t0), { accept: true, retryAfterMs: 0 });
  // Within the floor — reject.
  const blocked = reservePing("u1", t0 + 1_000);
  assert.equal(blocked.accept, false);
  // Release; next reserve should pass again immediately.
  releasePing("u1");
  assert.deepEqual(reservePing("u1", t0 + 1_500), { accept: true, retryAfterMs: 0 });
});
