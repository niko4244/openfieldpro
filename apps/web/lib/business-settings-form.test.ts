import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeServiceAreas,
  validateBusinessHours,
} from "./business-settings-form.js";

test("service areas are trimmed, deduplicated, and capped at the API limit", () => {
  const areas = Array.from({ length: 55 }, (_, index) => ` Area ${index} `);
  areas.splice(2, 0, "AREA 1", "");

  assert.deepEqual(normalizeServiceAreas(areas), Array.from({ length: 50 }, (_, index) => `Area ${index}`));
});

test("business hours require at least one work day", () => {
  assert.deepEqual(validateBusinessHours({ workDays: [], startTime: "08:00", endTime: "17:00" }), {
    workDays: "Choose at least one work day.",
  });
});

test("business hours require a valid opening window", () => {
  assert.deepEqual(validateBusinessHours({ workDays: ["mon"], startTime: "17:00", endTime: "08:00" }), {
    endTime: "Closing time must be later than opening time.",
  });
  assert.deepEqual(validateBusinessHours({ workDays: ["mon"], startTime: "08:00", endTime: "17:00" }), {});
});
