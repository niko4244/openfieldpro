# Mobile authentication security

OpenFieldPro's browser and native clients use different authentication transports.

## Browser contract

Browser login and registration are cookie-only:

- the API sets `ofp_session` as an HTTP-only, SameSite cookie;
- browser JSON responses contain only the public user identity and organization ID;
- a bearer token is never returned to browser JavaScript;
- browser storage must not contain an OpenFieldPro access token.

## Native contract

Native clients obtain a bearer token only from:

```text
POST /api/auth/native-login
X-OpenFieldPro-Client: native
```

The native endpoint rejects requests carrying browser `Origin` or `Sec-Fetch-Site` metadata. The token response is marked `Cache-Control: no-store`.

A production native client must:

1. Prompt for the individual team member's email and password.
2. Send credentials only to the configured HTTPS API origin.
3. Store the returned token and organization ID using the platform secure credential store.
4. Keep tokens out of Expo public environment variables, source control, logs, analytics, crash reports, SQLite, AsyncStorage, screenshots, and clipboard data.
5. Attach the token only as an `Authorization: Bearer` header to the configured API origin.
6. Delete the secure token on sign-out, account disablement, an unrecoverable 401/403 response, or organization removal.
7. Preserve downloaded field packages separately from authentication credentials and apply the organization's offline-data retention policy.
8. Reauthenticate after token expiry; the current API does not issue refresh tokens.

## Explicitly prohibited

The following pattern is not release-safe:

```text
EXPO_PUBLIC_AUTH_TOKEN=<shared JWT>
```

Expo public environment values are compiled into the client application and are not secret storage. A shared build-time credential also prevents individual revocation and audit attribution.

## Current release blocker

The existing technician app still reads `EXPO_PUBLIC_AUTH_TOKEN`. Until the native client is migrated to secure per-user login and the deterministic lockfile is regenerated and verified, all production release tags remain **no-go**.

The migration requires:

- `expo-secure-store` compatible with Expo SDK 52;
- a login and sign-out state in the technician application;
- secure token restore on startup;
- invalid-token cleanup;
- device tests on iOS and Android;
- offline restart and queued-write tests;
- committed `pnpm-lock.yaml` and `pnpm-lock.expected.sha256` generated together;
- a release-safety check that rejects `EXPO_PUBLIC_AUTH_TOKEN` in application code and deployment examples.

## Acceptance evidence

Attach all of the following to the migration pull request:

- API tests proving browser login never returns a token;
- API tests proving native login requires the native client protocol and rejects browser metadata;
- mobile type-check output;
- iOS and Android login, restart, sign-out, token-expiry, and offline evidence;
- secret scan showing no compiled/shared token configuration;
- deterministic lockfile digest;
- screenshots of mobile login, authenticated Today, offline mode, and signed-out state.
