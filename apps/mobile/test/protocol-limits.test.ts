import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_NATIVE_API_RESPONSE_BYTES,
  MAX_NATIVE_LOGIN_RESPONSE_BYTES,
} from "../src/auth.ts";
import { MAX_FIELD_PACKAGE_BYTES } from "../src/field-package.ts";
import { MAX_OFFLINE_BATCH_BYTES } from "../src/outbox-reconcile.ts";

const API_REQUEST_BODY_LIMIT_BYTES = 1_048_576;

test("offline replay envelope remains below the API request-body ceiling", () => {
  assert.equal(MAX_OFFLINE_BATCH_BYTES < API_REQUEST_BODY_LIMIT_BYTES, true);
  assert.equal(API_REQUEST_BODY_LIMIT_BYTES - MAX_OFFLINE_BATCH_BYTES >= 100_000, true);
});

test("field package cache limit remains below the native API response limit", () => {
  assert.equal(MAX_FIELD_PACKAGE_BYTES < MAX_NATIVE_API_RESPONSE_BYTES, true);
});

test("authentication responses use a substantially smaller limit", () => {
  assert.equal(MAX_NATIVE_LOGIN_RESPONSE_BYTES < MAX_FIELD_PACKAGE_BYTES, true);
});
