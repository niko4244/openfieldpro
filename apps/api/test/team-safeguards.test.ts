// Runnable check (no DB): node --import tsx --test test/team-safeguards.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { guardTeamChange, type TeamSnapshot } from "../src/team-safeguards.ts";

const snapshot = (overrides: Partial<TeamSnapshot> = {}): TeamSnapshot => ({
  actor: { id: "owner-1", role: "owner" },
  target: { id: "tech-1", role: "technician", active: true },
  otherActiveOwners: 1,
  ...overrides,
});

test("an owner can change a technician's role", () => {
  const result = guardTeamChange(snapshot(), { kind: "role", targetRole: "dispatcher" });
  assert.deepEqual(result, { ok: true });
});

test("an owner can deactivate another team member", () => {
  assert.deepEqual(guardTeamChange(snapshot(), { kind: "deactivate" }), { ok: true });
  assert.deepEqual(guardTeamChange(snapshot(), { kind: "remove" }), { ok: true });
});

test("non-owners cannot manage the team (403)", () => {
  const base = snapshot({ actor: { id: "tech-1", role: "technician" } });
  for (const change of [
    { kind: "role", targetRole: "owner" },
    { kind: "deactivate" },
    { kind: "remove" },
  ] as const) {
    const result = guardTeamChange(base, change);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 403);
      assert.match(result.error, /Only owners/);
    }
  }
});

test("a user cannot change their own role (409)", () => {
  const base = snapshot({ actor: { id: "owner-1", role: "owner" }, target: { id: "owner-1", role: "owner", active: true } });
  const result = guardTeamChange(base, { kind: "role", targetRole: "technician" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 409);
    assert.match(result.error, /cannot change your own role/);
  }
});

test("an owner re-selecting their own role is a no-op and allowed", () => {
  const base = snapshot({ actor: { id: "owner-1", role: "owner" }, target: { id: "owner-1", role: "owner", active: true } });
  assert.deepEqual(guardTeamChange(base, { kind: "role", targetRole: "owner" }), { ok: true });
});

test("a user cannot remove their own account (409)", () => {
  const base = snapshot({ actor: { id: "owner-1", role: "owner" }, target: { id: "owner-1", role: "owner", active: true } });
  assert.equal(guardTeamChange(base, { kind: "deactivate" }).ok, false);
  assert.equal(guardTeamChange(base, { kind: "remove" }).ok, false);
});

test("the final active owner cannot be demoted (409)", () => {
  const base = snapshot({
    actor: { id: "owner-2", role: "owner" },
    target: { id: "owner-1", role: "owner", active: true },
    otherActiveOwners: 0,
  });
  const result = guardTeamChange(base, { kind: "role", targetRole: "dispatcher" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 409);
    assert.match(result.error, /final owner cannot be demoted/);
    assert.match(result.hint ?? "", /Promote another/);
  }
});

test("the final active owner cannot be removed (409)", () => {
  const base = snapshot({
    actor: { id: "owner-2", role: "owner" },
    target: { id: "owner-1", role: "owner", active: true },
    otherActiveOwners: 0,
  });
  assert.equal(guardTeamChange(base, { kind: "deactivate" }).ok, false);
  assert.equal(guardTeamChange(base, { kind: "remove" }).ok, false);
});

test("an owner with another active owner present can be managed", () => {
  const base = snapshot({
    actor: { id: "owner-1", role: "owner" },
    target: { id: "owner-2", role: "owner", active: true },
    otherActiveOwners: 1,
  });
  assert.deepEqual(guardTeamChange(base, { kind: "role", targetRole: "technician" }), { ok: true });
  assert.deepEqual(guardTeamChange(base, { kind: "deactivate" }), { ok: true });
});

test("promoting someone to owner is always allowed, even by the final owner", () => {
  const base = snapshot({
    target: { id: "tech-1", role: "technician", active: true },
    otherActiveOwners: 0,
  });
  assert.deepEqual(guardTeamChange(base, { kind: "role", targetRole: "owner" }), { ok: true });
});

test("removing an inactive owner is not blocked by the final-owner rule", () => {
  const base = snapshot({
    actor: { id: "owner-2", role: "owner" },
    target: { id: "owner-1", role: "owner", active: false },
    otherActiveOwners: 0,
  });
  assert.deepEqual(guardTeamChange(base, { kind: "remove" }), { ok: true });
});
