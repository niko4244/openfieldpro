import { test } from "node:test";
import assert from "node:assert/strict";
import { dayWindow, dispatchBucket, milesBetween, toNumber } from "../src/dispatch-logic.ts";

test("dispatch bucket groups jobs by operational lane", () => {
  assert.equal(dispatchBucket("lead"), "unscheduled");
  assert.equal(dispatchBucket("scheduled"), "scheduled");
  assert.equal(dispatchBucket("lead", "appt-1"), "scheduled");
  assert.equal(dispatchBucket("in_progress"), "inProgress");
  assert.equal(dispatchBucket("completed"), "completed");
});

test("toNumber rejects missing and invalid coordinates", () => {
  assert.equal(toNumber(null), null);
  assert.equal(toNumber(undefined), null);
  assert.equal(toNumber("not-a-number"), null);
  assert.equal(toNumber("41.5868"), 41.5868);
});

test("dayWindow returns one UTC calendar day", () => {
  const { start, end } = dayWindow("2026-06-28");
  assert.equal(start.toISOString(), "2026-06-28T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-06-29T00:00:00.000Z");
});

test("milesBetween returns a stable approximate distance", () => {
  const ames = { lat: 42.0308, lng: -93.6319 };
  const desMoines = { lat: 41.5868, lng: -93.6250 };
  const miles = milesBetween(ames, desMoines);
  assert.ok(miles > 30);
  assert.ok(miles < 35);
});
