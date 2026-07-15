# Official distribution boundary

The public `niko4244/openfieldpro` repository contains the complete AGPL source, generic sponsor-display support, public verification keys, release schemas, documentation, and reproducible build inputs.

The private `niko4244/openfieldpro-ops` repository is the maintainer control plane. It contains sponsor campaign selection, outreach and contract records, official release scheduling, token inventories, entitlement issuance records, incident notes, and the workflow that builds official distributions.

## Information flow

Only explicitly approved public values may flow from private operations into an official build:

```text
openfieldpro-ops (private)
  approved sponsor name, message, URL, optional local asset
  release channel, public source ref, version
                   |
                   v
official build workflow
  validates values, checks out an immutable public source ref,
  runs public release gates, builds and signs release metadata
                   |
                   v
OpenFieldPro official package / GitHub Release
```

No contracts, prospect lists, payment records, API tokens, private signing keys, customer data, sponsor contacts, or internal notes may cross this boundary.

## Sponsor behavior

The public source exposes only generic build-time fields:

- `NEXT_PUBLIC_SPONSOR_NAME`
- `NEXT_PUBLIC_SPONSOR_TEXT`
- `NEXT_PUBLIC_SPONSOR_URL`

Official free distributions may populate those fields from a private approved campaign. Self-hosters can inspect, replace, or remove the placement under the AGPL. Optional support entitlements may hide official sponsor recognition, but must never restrict the core product.

## Updates

An official update identifies an immutable public commit and version. Private operations may coordinate and publish the update, but public source and release notes remain reviewable. Application runtimes must never receive a GitHub operations token or private signing key.

## Token boundary

- Public repository: public verification keys and token format only.
- Private operations: token identifiers, owners, purpose, expiry, rotation status, and revocation state.
- Secret manager or offline custody: actual access tokens and private signing keys.

The private repository is not a secret manager. Secrets are injected at runtime from GitHub Environments or an approved encrypted store and are never committed.

