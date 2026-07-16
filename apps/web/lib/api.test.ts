import assert from "node:assert/strict";
import test from "node:test";
import { parseSessionUser } from "./api.js";

test("session responses require every display and authorization field", () => {
  assert.throws(() => parseSessionUser({}), /Invalid session response/);
  assert.throws(
    () => parseSessionUser({ id: "owner-1", name: undefined, email: "owner@example.test", role: "owner" }),
    /Invalid session response/,
  );
});

test("a complete session user passes validation", () => {
  const user = { id: "owner-1", name: "Morgan Owner", email: "owner@example.test", role: "owner" };
  assert.deepEqual(parseSessionUser(user), user);
});
