# Contributing to OpenFieldPro

Thank you for helping build a dependable, self-hostable field-service platform.

## Before opening a change

1. Search existing issues and pull requests.
2. Use an issue for behavior changes, migrations, public APIs, or security-sensitive design.
3. Never include customer data, credentials, signing keys, sponsor contracts, private operational records, or production logs.
4. Report vulnerabilities through GitHub private vulnerability reporting as described in `SECURITY.md`.

## Development checks

Use Node 22 and the package manager version declared in `package.json`.

```bash
pnpm install:verified
pnpm release:safety
pnpm --filter @ofp/api build
pnpm --filter @ofp/api test
pnpm --filter @ofp/web test:unit
pnpm --filter @ofp/web build
pnpm --filter @ofp/mobile typecheck
```

Changes affecting user workflows should include the smallest useful automated test. Database changes must be additive migrations that preserve upgrades from released versions; never rewrite published migration history.

## Pull requests

- Keep changes focused and explain the user-visible outcome.
- Document migrations, configuration changes, security impact, and rollback steps.
- Update public documentation when behavior changes.
- Do not add telemetry, tracking, ad-network code, phone-home licensing, or restrictions on core field-service functionality.
- Confirm that official sponsorship and token operations remain outside this public repository.

Contributions are accepted under the repository's AGPL-3.0-only license.

