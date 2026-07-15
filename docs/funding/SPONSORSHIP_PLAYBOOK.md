# OpenFieldPro Sponsorship Playbook

This playbook follows the public business-plan and voice canon in `docs/product/BUSINESS_PLAN_AND_VOICE.md`.

OpenFieldPro is an AGPL-licensed, self-hostable field-service platform for independent service businesses. Sponsorship should fund maintenance, security, documentation, testing, accessibility, and reliable releases without selling project control or restricting the free core.

## 1. Apply for GitHub Sponsors

GitHub's personal-account process requires joining GitHub Sponsors, completing a sponsor profile, creating optional tiers, submitting bank or fiscal-host and tax information, enabling two-factor authentication, and requesting approval.

1. Enable two-factor authentication on the `niko4244` GitHub account.
2. Decide whether payouts should go directly to a bank account or through a fiscal host **before enrollment**. GitHub states that changing the fiscal-host choice later requires support.
3. Open the GitHub Sponsors dashboard and choose **Get sponsored** for the eligible account.
4. Complete identity and contact information accurately.
5. Submit bank/Stripe Connect or fiscal-host information.
6. Submit the applicable tax form.
7. Build the sponsor profile:
   - Short bio
   - Why OpenFieldPro exists
   - What sponsorship revenue funds
   - OpenFieldPro as featured work
   - A concrete, budget-backed sponsor goal
8. Publish monthly and one-time tiers.
9. Choose **Request approval**.
10. After approval, verify the public Sponsor profile and merge `.github/FUNDING.yml` into the default branch.

Official references:

- https://docs.github.com/en/sponsors/receiving-sponsorships-through-github-sponsors/setting-up-github-sponsors-for-your-personal-account
- https://docs.github.com/en/sponsors/receiving-sponsorships-through-github-sponsors/editing-your-profile-details-for-github-sponsors
- https://docs.github.com/en/sponsors/receiving-sponsorships-through-github-sponsors/managing-your-sponsorship-tiers
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository

## 2. Suggested sponsor profile copy

### Short bio

> Building OpenFieldPro, an open-source and self-hostable field-service platform for small service businesses: CRM, scheduling, dispatch, work orders, estimates, invoices, payments, and technician workflows without mandatory per-user subscriptions.

### Introduction

> OpenFieldPro exists so independent service businesses can own their operational data and run a complete lead-to-payment workflow on infrastructure they control. Sponsorship funds security reviews, reliable releases, mobile and offline workflows, documentation, accessibility, integrations, and the test infrastructure needed to make self-hosting practical. The core remains AGPL-licensed and usable without a sponsorship or entitlement key.

### Initial sponsor goal

> Fund recurring CI, security tooling, hosted test infrastructure, documentation, and one dependable maintenance day each week.

Publish a budget with actual costs before naming a dollar goal. Update it quarterly.

## 3. Recommended tiers

GitHub supports multiple monthly and one-time tiers. Start with a small, understandable set; tier prices cannot be edited after publication and must instead be retired and replaced.

| Tier | Suggested price | Appropriate benefit |
|---|---:|---|
| Supporter | $5/month | Name on supporter page, monthly public development summary |
| Field Friend | $15/month | Above plus early public release notes and community feedback invitation |
| Maintainer Backer | $50/month | Above plus quarterly group roadmap briefing |
| Business Sponsor | $250/month | Logo on sponsor page, quarterly group office hours, sponsor impact report |
| Sustaining Sponsor | $500/month | Prominent recognition, compatibility-testing queue, quarterly technical briefing |
| Founding Sponsor | $1,000/month | Founding recognition, limited scheduled support hours, quarterly project briefing |

One-time tiers can mirror $25, $100, $500, and $2,500 contributions.

### Benefits that are safe to offer

- Public recognition
- Sponsor-only progress summaries
- Group office hours
- Early access to release candidates
- Compatibility testing
- Clearly bounded support hours
- Optional locally verified support/plugin entitlements
- Sponsor input through the same transparent roadmap process used by the community

### Benefits not to offer

- Guaranteed feature placement or merge approval
- Undisclosed product influence
- Access to customer data, security reports, signing keys, or private vulnerability details
- Exclusivity that blocks competitors or community contributors
- A promise that a sponsor's logo implies certification or endorsement
- Permanent support obligations without a written capacity limit
- Limits on users, technicians, customers, jobs, invoices, locations, or core operations features

## 4. In-product sponsor policy

The free self-hosted dashboard may contain **one clearly labeled sponsor slot**. This is project support, not an advertising network.

Required rules:

- Exactly one sponsor placement at a time
- Clearly labeled `Sponsor`
- Static image/text configured locally by the deployment or bundled release
- No third-party ad scripts
- No behavioral targeting
- No tracking pixels, cookies, fingerprinting, telemetry, or phone-home
- No user/customer/job data sent to the sponsor
- No impression or click reporting unless the operator explicitly implements its own privacy-compliant local reporting
- No misleading endorsement or certification language
- Sponsor content must not obstruct field workflows, alerts, invoices, or customer records
- Self-hosters can inspect, modify, or remove the slot under the AGPL license

A paid support entitlement may hide the bundled sponsor placement or enable premium first-party plugins, but it must never disable or limit the core product.

## 5. Build the sponsorship package

Before outreach, prepare:

- A one-page project overview
- Current screenshots and a short product demo
- Public roadmap and release checklist
- Security policy
- AGPL license explanation
- Sponsor tiers and benefits
- Quarterly budget and use-of-funds statement
- Project metrics: contributors, releases, installations when measurable, issues closed, test coverage, and active deployments only when users opt in
- A plain conflict-of-interest policy
- The non-tracking sponsor-slot policy above

Do not invent download counts, users, savings, or adoption. Label estimates as estimates.

## 6. Find sponsors

Prioritize organizations that directly benefit from healthier independent service businesses or open-source operations software:

1. Appliance-parts distributors and regional parts houses
2. Tool, meter, diagnostic, and work-vehicle accessory manufacturers
3. Independent repair businesses and multi-location service companies
4. Payment, accounting, communications, mapping, and storage providers
5. Self-hosting, managed database, object-storage, and infrastructure companies
6. Trade educators, associations, and technician-training organizations
7. Open-source foundations and grant programs

Build a prospect sheet with organization, contact, relevance, proposed tier, last contact, next action, and result. Start with warm relationships and organizations already serving the field-service market.

### Weekly cadence

- Research 10 qualified prospects.
- Send 5 personalized requests.
- Follow up once after 7–10 days.
- Publish one concrete progress update.
- Thank current sponsors and report what their support enabled.

A small number of relevant, personalized requests is preferable to bulk outreach.

## 7. Outreach copy

### Initial business sponsor email

Subject: Sponsor an open-source field-service platform for independent service businesses

> Hi [Name],
>
> I maintain OpenFieldPro, an AGPL-licensed, self-hostable field-service platform covering customer management, scheduling, dispatch, work orders, estimates, invoicing, payments, and technician workflows.
>
> The project is designed for independent service businesses that want control of their data and an alternative to mandatory per-user SaaS subscriptions. [Company] is relevant because [specific connection to their customers, product, or open-source work].
>
> I am opening a limited group of project sponsorships to fund security work, release testing, documentation, mobile/offline reliability, and integrations. Business sponsorship includes public recognition, quarterly group briefings, and a transparent impact report; it does not buy roadmap control or access to customer data.
>
> Project: https://github.com/niko4244/openfieldpro
> Sponsorship details: [GitHub Sponsors URL after approval]
>
> Would a 20-minute conversation about a $250 or $500 monthly sponsorship be appropriate?
>
> Thank you,
> Nikolas Marconcini

### Follow-up

Subject: Re: OpenFieldPro sponsorship

> Hi [Name],
>
> I wanted to follow up once on the OpenFieldPro sponsorship note below. The most relevant current milestone for [Company] is [specific release, integration, or user benefit].
>
> A sponsorship would directly fund [one or two concrete deliverables]. I am also open to an in-kind infrastructure or testing sponsorship if that fits better than cash support.
>
> No response is necessary if this is not a fit. Thank you for considering it.
>
> Nikolas

## 8. Grants and fiscal hosting

A fiscal host can receive and administer funds, but it may charge fees and impose reporting or spending rules. Decide whether OpenFieldPro needs one before GitHub Sponsors enrollment. Compare eligibility, legal structure, fees, tax handling, reimbursements, ownership of funds/assets, reporting, corporate-grant support, and exit terms.

Do not describe sponsorship payments as tax-deductible unless the receiving structure and applicable law support that claim.

## 9. Governance and transparency

Publish a quarterly sponsor report containing funds received by category, processing/fiscal-host fees, infrastructure and contractor spending, releases/security work completed, work deferred, and current project-expense runway.

Sponsor funding must not override security, code review, licensing, contributor credit, user privacy, or the AGPL core. Material sponsor relationships should be disclosed.

## 10. Activation checklist

- [ ] Two-factor authentication enabled
- [ ] Bank versus fiscal-host decision documented
- [ ] Tax and payout information submitted
- [ ] Sponsor profile reviewed for factual claims
- [ ] At least three monthly tiers and two one-time tiers published
- [ ] Sponsor goal tied to a public budget
- [ ] `.github/FUNDING.yml` merged to the default branch
- [ ] Sponsor button enabled in repository settings
- [ ] Sponsor page linked from README and project website
- [ ] Conflict-of-interest and recognition policy published
- [ ] Non-tracking sponsor-slot policy published
- [ ] First 25 qualified prospects identified
- [ ] Quarterly sponsor reporting date scheduled
