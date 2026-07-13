import assert from "node:assert/strict";
import test from "node:test";
import {
  STORAGE_SCHEMA_VERSION,
  storageIdentityDecision,
} from "../src/storage-identity.ts";

const expected = { orgId: "org-123", userId: "user-456" };

test("new user-scoped databases initialize an identity row", () => {
  assert.equal(storageIdentityDecision(null, expected), "initialize");
});

test("matching storage identity is accepted", () => {
  assert.equal(
    storageIdentityDecision(
      {
        org_id: expected.orgId,
        user_id: expected.userId,
        schema_version: STORAGE_SCHEMA_VERSION,
      },
      expected,
    ),
    "verified",
  );
});

test("organization and user mismatches fail closed", () => {
  assert.throws(
    () =>
      storageIdentityDecision(
        {
          org_id: "other-org",
          user_id: expected.userId,
          schema_version: STORAGE_SCHEMA_VERSION,
        },
        expected,
      ),
    /identity mismatch/,
  );
  assert.throws(
    () =>
      storageIdentityDecision(
        {
          org_id: expected.orgId,
          user_id: "other-user",
          schema_version: STORAGE_SCHEMA_VERSION,
        },
        expected,
      ),
    /identity mismatch/,
  );
});

test("unsupported offline schemas fail closed", () => {
  assert.throws(
    () =>
      storageIdentityDecision(
        {
          org_id: expected.orgId,
          user_id: expected.userId,
          schema_version: STORAGE_SCHEMA_VERSION - 1,
        },
        expected,
      ),
    /schema is not supported/,
  );
});
