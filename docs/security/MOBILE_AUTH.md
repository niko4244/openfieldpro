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
3. Store a persistent token only in the platform secure credential store.
4. Keep tokens out of Expo public environment variables, source control, logs, analytics, crash reports, SQLite, AsyncStorage, screenshots, and clipboard data.
5. Attach the token only as an `Authorization: Bearer` header to the configured API origin.
6. Delete the token on sign-out, account disablement, an unrecoverable 401/403 response, or organization removal.
7. Preserve downloaded field packages separately from authentication credentials and apply the organization's offline-data retention policy.
8. Reauthenticate after token expiry; the current API does not issue refresh tokens.

## Explicitly prohibited

The following pattern is not release-safe:

```text
EXPO_PUBLIC_AUTH_TOKEN=<shared JWT>
```

Expo public environment values are compiled into the client application and are not secret storage. A shared build-time credential also prevents individual revocation and audit attribution.

## Phase-one implementation

The `mobile-per-user-auth` branch removes the compiled shared credential without adding a dependency or changing the deterministic lockfile:

- each user signs in with an individual account;
- the bearer token is held only in React memory;
- API requests are constrained to the configured HTTPS origin and remain inside the normalized `/api/` namespace;
- API origins containing embedded username/password credentials are rejected;
- authorization, organization, and native-client headers cannot be overridden by callers;
- terminal 401/403 responses return the app to sign-in;
- native session identifiers are validated by UTF-8 byte length before storage paths are created;
- offline packages and queued writes use reversible, collision-resistant v2 database names derived from the exact organization and user IDs;
- every database stores an internal organization/user/schema identity row and fails closed if it does not match the signed-in account;
- unsafe storage identity/schema conditions use terminal session handling rather than ordinary offline fallback;
- refresh, interval, and startup synchronization are serialized;
- sign-out waits for active synchronization before SQLite closes, and a closed service cannot reopen its database;
- malformed or tampered offline rows are moved to `diagnostic_dead_letter` before any network request;
- every submitted offline operation is deleted, explicitly failed, or marked unacknowledged; unknown and duplicate server results cannot silently alter another operation;
- release safety fails if `EXPO_PUBLIC_AUTH_TOKEN` returns to mobile application code.

This is a security improvement over the shared build-time JWT, but it is not the complete production target.

## Remaining release blockers

All production release tags remain **no-go** until these items are complete:

- add the Expo SDK 52 compatible secure credential-store dependency from the existing reviewed lockfile;
- persist and restore the individual session securely;
- prove an authorized user can reopen their own retained packages after an offline app restart;
- define and test migration or quarantine of the legacy shared `openfieldpro-field.db` database and earlier phase-one cache names without losing queued work;
- define office-visible recovery/export behavior for dead-letter diagnostic operations;
- verify sign-in, restart, expiration, sign-out, storage failure, dead-letter recovery, and offline behavior on iOS and Android;
- regenerate and review `pnpm-lock.yaml` and `pnpm-lock.expected.sha256` together for any dependency change.

Until secure persistence lands, force-quitting the application clears the token and requires online sign-in before the user-scoped cache can be reopened. The app must not weaken that boundary by selecting cached customer data from an unverified email alone.

## Acceptance evidence

Attach all of the following to the completed migration pull request:

- API tests proving browser login never returns a token;
- API tests proving native login requires the native client protocol and rejects browser metadata;
- mobile authentication, normalized-path, header-locking, UTF-8 identity, cache-binding, outbox reconciliation, user-isolation, and single-flight tests;
- mobile type-check output;
- iOS and Android login, restart, sign-out, token-expiry, unsafe-storage, dead-letter, and offline evidence;
- secret scan showing no compiled/shared token configuration;
- deterministic lockfile digest;
- screenshots of mobile login, authenticated Today, offline mode, session-expired, unsafe-storage, dead-letter, and signed-out states.
