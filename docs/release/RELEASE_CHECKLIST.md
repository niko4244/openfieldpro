# OpenFieldPro Release Checklist

A release is ready only when every required gate below is complete and evidence is attached to the release or pull request. A green build alone is insufficient.

## 1. Scope and version

- [ ] Release scope is written in user-facing terms.
- [ ] Breaking changes and migration requirements are identified.
- [ ] Version and release tag are selected.
- [ ] Deferred defects have owners and documented impact.
- [ ] No feature is described as complete when its production dependency is still mocked or optional.
- [ ] Public copy remains vendor-neutral and makes no unsupported adoption or savings claim.
- [ ] The product parity gap audit in `docs/release/PRODUCT_PARITY_GAP_AUDIT.md` is resolved or explicitly accepted as a no-go blocker.

## 2. Source and dependency integrity

```bash
pnpm install:verified
pnpm release:safety
pnpm audit:dependencies
```

- [ ] `pnpm lock:prepare` regenerates the lockfile from committed manifests and matches `pnpm-lock.expected.sha256`.
- [ ] The regenerated lockfile installs with `--frozen-lockfile`.
- [ ] Repository secret scan passes.
- [ ] No `.env`, private PEM, signing key, live payment key, cloud access key, database export, or customer data is tracked.
- [ ] Dependency audit has no unaccepted high/critical production vulnerability.
- [ ] Every accepted exception has a written rationale, compensating control, owner, and expiration date.
- [ ] AGPL license and required third-party notices are present.

## 3. Automated validation

```bash
pnpm db:check
ALLOW_SCHEMA_PUSH=true pnpm db:migrate
pnpm db:parity
pnpm --filter @ofp/api build
pnpm --filter @ofp/api test
pnpm --filter @ofp/web test:unit
pnpm --filter @ofp/web build
pnpm --filter @ofp/web test:e2e
pnpm --filter @ofp/mobile typecheck
```

- [ ] Committed migrations apply to an empty PostgreSQL database without interactive prompts.
- [ ] Database table, column, and type parity matches the application schema.
- [ ] API compiles and all tests pass.
- [ ] Web unit tests pass.
- [ ] Next.js production build passes.
- [ ] Chromium operations tests pass with no console or page errors.
- [ ] Technician mobile app type-checks.
- [ ] Desktop and mobile screenshots are inspected by a human.
- [ ] Browser tests cover the release's changed primary workflows.
- [ ] CI uses `pnpm install:verified`, not an unlocked install.

## 4. Lead-to-payment workflow

Test with a clean organization and realistic non-production data:

- [ ] Configure company profile, business hours, service area, invoice defaults, estimate defaults, payment options, tax/discount settings, messages, numbering, and portal settings.
- [ ] Create a new customer during job intake.
- [ ] Create a job for an existing customer.
- [ ] Create both scheduled and unscheduled work.
- [ ] Assign an owner or technician.
- [ ] Confirm overlapping appointments are rejected.
- [ ] Start a scheduled job.
- [ ] Complete an in-progress job.
- [ ] Add billable line items and verify job total and retained labor cost.
- [ ] Confirm a zero-dollar job cannot be invoiced.
- [ ] Confirm concurrent requests cannot create duplicate active invoices or duplicate invoice numbers.
- [ ] Create an invoice from the closeout queue.
- [ ] Send or mark the invoice according to the configured invoice settings.
- [ ] Record a partial payment.
- [ ] Confirm checkout charges only the remaining balance.
- [ ] Record the final payment and confirm paid status.
- [ ] Confirm duplicate webhook delivery is idempotent.
- [ ] Verify activity history, reporting, search, and mobile sync reflect the same state.
- [ ] Verify customer-facing invoice and estimate previews obey the configured visibility, terms, message, numbering, payment, tax, and branding settings.

## 5. Authentication and authorization

- [ ] `NODE_ENV=production` is set.
- [ ] `JWT_SECRET` is unique, at least 32 characters, and stored in a secret manager.
- [ ] Startup fails with a missing/default production JWT secret.
- [ ] JWT expiry is explicitly configured and tested.
- [ ] Registration and login rate limits return `429` and `Retry-After` after the threshold.
- [ ] Duplicate registration is transaction-safe.
- [ ] Disabled users cannot authenticate or retain active access.
- [ ] Role boundaries are tested for owner, dispatcher, and technician.
- [ ] Organization scoping is verified for reads and writes.
- [ ] Admin and signing-key operations are audited.

## 6. Network and application security

- [ ] `CORS_ORIGIN` lists only intended HTTPS origins.
- [ ] Wildcard production CORS is rejected.
- [ ] `PUBLIC_WEB_URL` is the exact HTTPS browser origin used by payment redirects.
- [ ] `TRUST_PROXY=true` is enabled only behind a trusted proxy that replaces forwarding headers.
- [ ] TLS terminates at a trusted proxy or load balancer.
- [ ] API, database, Redis, and object storage are not publicly exposed unless explicitly required and protected.
- [ ] Rate limits are configured for authentication, public booking, uploads, checkout, and other abuse-prone endpoints.
- [ ] JSON body size, upload size, MIME type, and storage permissions are validated.
- [ ] HSTS, CSP, frame, content-type, referrer, permissions, and resource-policy headers are verified.
- [ ] Logs redact authorization headers, cookies, tokens, payment secrets, and customer-sensitive payloads.

## 7. Payments

When Stripe is disabled:

- [ ] Manual/offline payment flow works without Stripe configuration.
- [ ] UI clearly distinguishes manually recorded payment from online card collection.

When Stripe is enabled:

- [ ] Live and test credentials are stored separately.
- [ ] Both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are configured.
- [ ] Webhook signature verification is enabled with the correct environment secret.
- [ ] Success and cancel URLs point to `PUBLIC_WEB_URL`, not the API origin.
- [ ] Duplicate webhook delivery is idempotent.
- [ ] Webhook metadata is organization-scoped and invoice-scoped.
- [ ] Webhook amount must equal the current outstanding balance.
- [ ] Partial, full, duplicate, overpayment, paid, void, and refund behavior is tested.
- [ ] Concurrent manual and online payments cannot overpay the invoice.
- [ ] No raw card number or CVC passes through OpenFieldPro servers.

## 8. Data protection

- [ ] Data retention and deletion policy is documented.
- [ ] Customer export and deletion procedures are tested.
- [ ] Database backups are encrypted.
- [ ] Object-storage backups include photos and documents.
- [ ] Restore drill completes in an isolated environment.
- [ ] Restore time and recovery point are recorded.
- [ ] Database migrations are tested against a production-sized copy with sensitive data removed.
- [ ] Rollback or forward-fix plan exists for every migration.

## 9. Infrastructure

- [ ] Compose/deployment configuration resolves successfully.
- [ ] Persistent volumes are explicit.
- [ ] Health checks exist for API, web, Postgres, Redis, and storage.
- [ ] Resource limits and restart policies are set.
- [ ] Time zone and clock synchronization are correct.
- [ ] Outbound email/SMS/payment/network dependencies are tested from the deployment environment.
- [ ] Monitoring covers availability, error rates, queue depth, storage, backups, and failed payments.
- [ ] Alert routing has a named owner.

## 10. Mobile and offline

- [ ] Test on at least one supported iOS device/simulator and Android device/emulator.
- [ ] Authentication persists and revokes correctly.
- [ ] Today's jobs and work-order details render on small screens.
- [ ] Offline changes queue without data loss.
- [ ] Reconnection sync is idempotent.
- [ ] Conflicting edits present a recoverable state.
- [ ] Photos and notes survive app termination during upload/sync.
- [ ] App version compatibility with the API is documented.

## 11. Accessibility and visual QA

- [ ] Keyboard-only navigation works for primary workflows.
- [ ] Current navigation item is announced.
- [ ] Dialog focus is trapped and restored.
- [ ] Form inputs have programmatic labels and actionable errors.
- [ ] Status is not conveyed by color alone.
- [ ] Desktop and 390px mobile layouts have no document-level horizontal overflow.
- [ ] Light and dark themes are inspected.
- [ ] Screenshots attached: intake, dispatch conflict, closeout, invoice/payment, desktop, and mobile.

## 12. Signing and entitlement keys

- [ ] Core AGPL operation does not require an entitlement key.
- [ ] Users, technicians, customers, jobs, invoices, locations, and core features are not key-gated.
- [ ] Verification remains local with no license server, telemetry, or phone-home.
- [ ] Private signing key was generated outside the repository at `~/.ofp/license-signing-key.pem` or an equivalently secured path.
- [ ] Private key permissions are restricted and encrypted offline backups exist.
- [ ] Public fingerprint is recorded.
- [ ] Key generation and verification tests pass.
- [ ] Tampered, wrong-key, future, and expired tokens fail verification.
- [ ] Revocation ledger and rotation owner are identified.
- [ ] No private key is present in application runtime or CI after the ephemeral smoke test ends.

See `docs/security/KEY_MANAGEMENT.md`.

## 13. Sponsorship and public claims

- [ ] Product parity gaps are not being hidden by sponsor/revenue language.
- [ ] Sponsor outreach is paused if `docs/release/PRODUCT_PARITY_GAP_AUDIT.md` still marks the product as release-blocked.
- [ ] Sponsor profile statements are factual.
- [ ] Adoption metrics are measured or explicitly labeled estimates.
- [ ] Sponsorship benefits do not sell merge approval, undisclosed control, customer data, or security access.
- [ ] Sponsor recognition does not imply certification or endorsement.
- [ ] The optional dashboard sponsor slot is singular, clearly labeled, static, non-tracking, and locally configurable.
- [ ] No ad network, tracking pixel, behavioral targeting, or sponsor data sharing is present.
- [ ] FUNDING links resolve.
- [ ] Use-of-funds reporting date is published.

See `docs/funding/SPONSORSHIP_PLAYBOOK.md`.

## 14. Release evidence

Attach or link:

- [ ] Commit SHA and signed/annotated tag
- [ ] CI run
- [ ] Deterministic lockfile digest
- [ ] Dependency-audit result
- [ ] Migration result
- [ ] Backup and restore drill result
- [ ] Desktop/mobile visual artifact
- [ ] Native iOS and Android test evidence
- [ ] Known limitations
- [ ] Upgrade instructions
- [ ] Rollback/forward-fix plan
- [ ] Changelog and release notes

## 15. Go/no-go

A release is **no-go** when any of these is true:

- High/critical unaccepted production vulnerability
- Default or missing production secret
- Wildcard production CORS or invalid payment redirect origin
- Failed deterministic lock verification
- Failed backup restore
- Unreviewed destructive migration
- Lead-to-payment workflow failure
- Duplicate invoice/payment risk
- Lost offline changes
- Private key or customer data exposure
- Key-gated AGPL core or phone-home licensing
- Failed build, test, type-check, or required browser/device check

The release owner records the final decision, date, commit, evidence, accepted risks, and rollback owner.
