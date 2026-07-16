import { test } from "node:test";
import assert from "node:assert/strict";
import { activityQueryParams } from "../src/routes/activities.ts";

test("organization activity feed is bounded by default", () => {
  assert.deepEqual(activityQueryParams.parse({}), { limit: 50 });
});

test("organization activity feed rejects an excessive limit", () => {
  assert.equal(activityQueryParams.safeParse({ limit: 201 }).success, false);
});
