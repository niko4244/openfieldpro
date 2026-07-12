# Secure mobile authentication migration plan

This work is intentionally separated from PR #7's browser/API authorization changes because it requires a reviewed native dependency and deterministic lockfile update.

## Scope

- Remove every use of `EXPO_PUBLIC_AUTH_TOKEN` and `EXPO_PUBLIC_ORG_ID` as credentials.
- Add Expo SecureStore at the Expo SDK 52 compatible version.
- Add per-user email/password login through `/api/auth/native-login` with `X-OpenFieldPro-Client: native`.
- Persist token, public user identity, and organization ID in platform secure storage.
- Restore the session on startup without exposing credentials in logs or UI.
- Delete credentials on sign-out and terminal 401/403 responses.
- Preserve cached field packages and queued diagnostic operations according to offline retention policy.
- Add explicit handling for expired sessions while offline.

## Dependency procedure

1. Start from the current committed `pnpm-lock.yaml`.
2. Add `expo-secure-store` to `apps/mobile/package.json` using the Expo SDK 52 compatible range.
3. Run:

```bash
pnpm install --lockfile-only --no-frozen-lockfile
sha256sum pnpm-lock.yaml
```

4. Review the dependency diff. It should add SecureStore without unrelated upgrades.
5. Update `pnpm-lock.expected.sha256` to the reviewed digest.
6. Run `pnpm install:verified` from a clean checkout.

Do not generate a fresh lockfile from empty state: that can resolve unrelated package upgrades and is not an acceptable security migration.

## Required test matrix

### API

- Browser login response has no token.
- Native login requires the native marker.
- Native login rejects Origin and Sec-Fetch browser metadata.
- Invalid, inactive, and wrong-password users receive generic 401 responses.
- Rate limiting applies independently by IP/email.

### Mobile

- First login on iOS and Android.
- Credential restoration after full app termination.
- Sign-out deletes secure credentials.
- Expired/invalid token forces sign-in when online.
- Offline restart shows only retained field packages and clearly indicates authentication cannot be renewed offline.
- Reconnection authenticates before flushing queued writes.
- Organization/user change cannot expose the previous user's cached work.
- Screenshots, logs, crash reports, SQLite, and AsyncStorage contain no JWT.

## Release gate

The production mobile app is no-go until this plan is complete. PR #7 may introduce the server protocol and cookie-only browser response, but it must not claim that native authentication is complete while the app still compiles a shared public token.
