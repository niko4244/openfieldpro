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

test("native login requires its client marker and rejects browser metadata", () => {
  assert.equal(nativeLoginRequestAllowed(undefined, undefined, "native"), true);
  assert.equal(nativeLoginRequestAllowed(null, null, "native"), true);
  assert.equal(nativeLoginRequestAllowed(undefined, undefined, undefined), false);
  assert.equal(nativeLoginRequestAllowed(undefined, undefined, "browser"), false);
  assert.equal(nativeLoginRequestAllowed("https://app.example", undefined, "native"), false);
  assert.equal(nativeLoginRequestAllowed("null", undefined, "native"), false);
  assert.equal(nativeLoginRequestAllowed(undefined, "same-origin", "native"), false);
  assert.equal(nativeLoginRequestAllowed(undefined, "cross-site", "native"), false);
});
