# Secure mobile authentication migration plan

This work is separated from PR #7's browser/API authorization changes and implemented in two reviewable phases.

## Phase one — remove the shared credential

The `mobile-per-user-auth` branch must:

- remove every use of `EXPO_PUBLIC_AUTH_TOKEN` and `EXPO_PUBLIC_ORG_ID` as credentials;
- add per-user email/password login through `/api/auth/native-login` with `X-OpenFieldPro-Client: native`;
- keep the token only in app memory;
- constrain authenticated requests to the configured HTTPS API origin and normalized `/api/` namespace;
- reject API URLs containing embedded credentials;
- force sign-in after terminal 401/403 or unsafe local-storage responses;
- validate native account identifiers before deriving local storage paths;
- isolate SQLite packages and queued operations by exact organization ID and user ID;
- bind every database internally to that organization, user, and schema version;
- serialize startup, interval, and pull-to-refresh synchronization;
- wait for active synchronization before closing SQLite and prevent post-close reopening;
- quarantine malformed or tampered offline rows before network replay;
- reconcile every submitted operation exhaustively;
- add dependency-free mobile auth, storage, outbox, and synchronization tests;
- make release safety reject any future compiled shared token.

Phase one deliberately requires sign-in after every app restart. It must not expose cached customer data based only on an entered email address.

## Phase two — secure persistence and offline restart

The production target must:

- add Expo SecureStore at the Expo SDK 52 compatible version;
- persist the token, public user identity, and organization ID in platform secure storage;
- restore the session on startup without exposing credentials in logs or UI;
- delete credentials on sign-out and terminal 401/403 responses;
- preserve cached field packages and queued diagnostic operations according to offline retention policy;
- define migration or quarantine of the legacy shared `openfieldpro-field.db` database and earlier phase-one cache filenames;
- provide an auditable recovery/export path for dead-letter operations;
- add explicit handling for expired sessions while offline.

## Dependency procedure

1. Start from the current committed `pnpm-lock.yaml`; do not generate a fresh lock from empty state.
2. Add `expo-secure-store` to `apps/mobile/package.json` using the Expo SDK 52 compatible range.
3. Run:

```bash
pnpm install --lockfile-only --no-frozen-lockfile
sha256sum pnpm-lock.yaml
```

4. Review the dependency diff. It should add SecureStore without unrelated upgrades.
5. Update `pnpm-lock.expected.sha256` to the reviewed digest.
6. Run `pnpm install:verified` from a clean checkout.

A lockfile regeneration that changes unrelated dependencies must be rejected.

## Required test matrix

### API

- Browser login response has no token.
- Native login requires the native marker.
- Native login rejects Origin and Sec-Fetch browser metadata.
- Invalid, inactive, and wrong-password users receive generic 401 responses.
- Rate limiting applies independently by IP/email.

### Mobile phase one

- Native login normalizes email and sends the native client marker.
- Malformed bearer tokens, roles, account IDs, oversized UTF-8 IDs, and invalid Unicode identities are rejected.
- Authenticated requests remain on the configured origin.
- Normalized path traversal cannot escape `/api/`.
- API URLs with embedded credentials are rejected.
- Callers cannot override authorization, organization, or native-client headers.
- Production endpoints require HTTPS.
- Terminal authorization failures are distinguishable from transient network failures.
- Database names are deterministic and collision-resistant per organization/user.
- Internal database identity and schema mismatches fail closed.
- A signed-out synchronization service cannot reopen its database.
- Corrupt JSON, invalid operation kinds/IDs, and oversized replay payloads are quarantined.
- Missing, duplicate, and unknown server acknowledgements are reconciled deterministically.
- Concurrent refreshes share one synchronization execution.
- Shutdown waits for active synchronization and suppresses future work.

### Mobile phase two and device validation

- First login on iOS and Android.
- Credential restoration after full app termination.
- Sign-out deletes secure credentials.
- Expired/invalid token forces sign-in when online.
- Offline restart shows only the authenticated user's retained field packages.
- Reconnection authenticates before flushing queued writes.
- Organization/user change cannot expose the previous user's cached work.
- Legacy shared-cache migration does not lose queued operations.
- Dead-letter operations can be reviewed and recovered without silent data loss.
- Screenshots, logs, crash reports, SQLite, and AsyncStorage contain no JWT.

## Release gate

Phase one may merge as a security correction only after its full CI passes, because it removes the compiled shared JWT. Production mobile release remains **no-go** until phase two, device validation, deterministic dependency verification, legacy-cache handling, and dead-letter recovery are complete.
