import assert from "node:assert/strict";
import test from "node:test";
import {
  browserAuthResponse,
  nativeAuthResponse,
  nativeLoginRequestAllowed,
} from "../src/auth-session-response.ts";

const identity = {
  token: "header.payload.signature",
  user: {
    id: "user-1",
    name: "Alex Rivera",
    email: "alex@example.test",
    role: "technician",
  },
  orgId: "org-1",
};

test("browser authentication response never exposes the bearer token", () => {
  const response = browserAuthResponse(identity);
  assert.deepEqual(response, { user: identity.user, orgId: "org-1" });
  assert.equal("token" in response, false);
});

test("native authentication response includes the bearer token", () => {
  assert.deepEqual(nativeAuthResponse(identity), identity);
});

test("native login rejects browser origin and fetch metadata", () => {
  assert.equal(nativeLoginRequestAllowed(undefined, undefined), true);
  assert.equal(nativeLoginRequestAllowed(null, null), true);
  assert.equal(nativeLoginRequestAllowed("https://app.example", undefined), false);
  assert.equal(nativeLoginRequestAllowed("null", undefined), false);
  assert.equal(nativeLoginRequestAllowed(undefined, "same-origin"), false);
  assert.equal(nativeLoginRequestAllowed(undefined, "cross-site"), false);
});
