# OpenFieldPro business plan and voice

This is the public product canon for business model, positioning, and tone. If a README section, sponsor pitch, product page, entitlement copy, or UI message conflicts with this document, this document wins.

## Position

OpenFieldPro is an open-source, self-hostable field-service management platform for independent service businesses that want to own their software, data, workflows, and customer experience.

Primary idea: **Own your field operations.**

OpenFieldPro covers the lead-to-payment workflow: customer intake, properties, scheduling, dispatch, work orders, estimates, invoices, payments, documents, service plans, reviews, reporting, integrations, and technician mobile workflows.

Appliance-service depth is an optional vertical workflow, not the whole product definition.

## Business model

The AGPL core is free to self-host and complete enough to run real field-service operations.

OpenFieldPro must not charge by user, technician, customer, job, invoice, location, or core operational feature. The core must not depend on OpenFieldPro infrastructure, telemetry, a license server, or phone-home checks.

Revenue can come from:

- project sponsorships;
- bounded support;
- compatibility testing;
- premium first-party plugins and workflow packs;
- locally verified offline entitlement keys;
- commercial license exceptions when appropriate.

Revenue must not come from restricting the core workflow, selling customer data, adding ad-network behavior, or hiding essential operational data behind a paywall.

## Entitlement tiers

The public product uses offline-signed entitlement keys. They verify locally and do not contact a license server.

- `free`: no key. Complete AGPL core with a clearly labeled sponsor placement.
- `pro`: annual polish tier. Removes sponsor placement and unlocks Pro feature flags.
- `founder`: lifetime Pro-equivalent tier for early supporters and the single owner test entitlement.
- `business`: higher tier for business integrations, compatibility testing, and support workflows.

Invalid, missing, or expired keys must fall back to Free without deleting, hiding, or holding customer data hostage.

## Sponsorship model

The free self-hosted dashboard may show exactly one clearly labeled sponsor slot. It is project support, not an ad network.

Sponsor rules:

- no tracking pixels;
- no behavioral targeting;
- no third-party ad scripts;
- no sponsor access to customer, job, invoice, technician, or usage data;
- no undisclosed product influence;
- no sponsor control over security review, roadmap priority, or release approval;
- no misleading endorsement language.

Only approved public sponsor copy may enter an official build. Sponsor operations, release scheduling, token records, and entitlement metadata belong in the private operations repository.

## Voice

OpenFieldPro should sound practical, direct, and field-ready.

Use:

- plain operational language;
- ownership, control, reliability, and data portability;
- concrete workflow terms: schedule, dispatch, estimate, invoice, payment, service history;
- factual claims that can be verified in the product or docs;
- calm confidence.

Avoid:

- startup hype;
- vague “AI-powered platform” claims without a built feature;
- fear-based sales language;
- direct competitor naming in public repository copy, metadata, or UI;
- promises of savings, adoption, tax treatment, or legal status without evidence;
- language implying sponsorship buys roadmap control or certification.

Preferred phrases:

- Own your field operations.
- Self-hostable by design.
- No telemetry. No phone-home licensing. No artificial core limits.
- Dispatch, schedule, invoice, and track work from your own stack.
- Clear sponsor recognition, not ad-network targeting.

## Product promises

OpenFieldPro can promise:

- self-hostable source under AGPL;
- no mandatory per-user subscriptions for the core;
- local entitlement verification;
- sponsor transparency;
- data ownership and export-friendly architecture;
- release gates for security, dependency, build, and product checks.

OpenFieldPro must not promise:

- managed hosting unless that service exists;
- automatic compliance with trade, tax, accounting, or privacy laws;
- guaranteed uptime for self-hosted installs;
- support capacity beyond a written limit;
- sponsor exclusivity;
- that a sponsor is certified, endorsed, or preferred unless a separate explicit program exists.

## Public customer framing

Marco's Appliance Repair Company is the first private owner-test customer for proving the public-facing app flow. Treat it as test entitlement metadata, not public marketing proof.

Do not imply paid adoption, customer endorsement, or production usage unless that is separately confirmed and approved for publication.
