import assert from "node:assert/strict";
import test from "node:test";
import { NativeRequestError } from "../src/auth.ts";
import {
  OfflineStorageError,
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

test("organization and user mismatches fail closed as terminal session failures", () => {
  for (const stored of [
    {
      org_id: "other-org",
      user_id: expected.userId,
      schema_version: STORAGE_SCHEMA_VERSION,
    },
    {
      org_id: expected.orgId,
      user_id: "other-user",
      schema_version: STORAGE_SCHEMA_VERSION,
    },
  ]) {
    assert.throws(
      () => storageIdentityDecision(stored, expected),
      (caught: unknown) =>
        caught instanceof OfflineStorageError &&
        caught instanceof NativeRequestError &&
        caught.status === 403 &&
        caught.terminalAuthenticationFailure &&
        caught.terminalStorageFailure &&
        /identity mismatch/.test(caught.message),
    );
  }
});

test("unsupported offline schemas fail closed as terminal session failures", () => {
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
    (caught: unknown) =>
      caught instanceof OfflineStorageError &&
      caught.status === 403 &&
      caught.terminalAuthenticationFailure &&
      caught.terminalStorageFailure &&
      /schema is not supported/.test(caught.message),
  );
});
