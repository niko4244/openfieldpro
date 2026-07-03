// Runnable check for open-core feature gating (@ofp/shared featuresForPlan).
// Run: npx tsx --test test/features.test.ts   (from apps/api)
import test from "node:test";
import assert from "node:assert";
import { featuresForPlan, planAtLeast, planLabel, PLANS, THEMES, WORKFLOW_PACKS } from "@ofp/shared";

test("free: sponsor slot visible, no premium flags on", () => {
  const f = featuresForPlan("free");
  assert.equal(f.removeSponsorSlot, false);
  assert.ok(Object.values(f).every((v) => v === false), "free has every flag off");
});

test("missing/unknown/expired-fallback plans resolve to free", () => {
  assert.deepEqual(featuresForPlan(null), featuresForPlan("free"));
  assert.deepEqual(featuresForPlan(undefined), featuresForPlan("free"));
  assert.deepEqual(featuresForPlan("enterprise"), featuresForPlan("free"));
});

test("pro: sponsor hidden, polish on, business integrations off", () => {
  const f = featuresForPlan("pro");
  assert.equal(f.removeSponsorSlot, true);
  assert.equal(f.brandedReports, true);
  assert.equal(f.customThemes, true);
  assert.equal(f.advancedExports, true);
  assert.equal(f.advancedAnalytics, true);
  assert.equal(f.premiumPlugins, true);
  assert.equal(f.industryPacks, true);
  assert.equal(f.aiWorkflowPacks, true);
  assert.equal(f.officialSupportBadge, true);
  assert.equal(f.businessIntegrations, false);
});

test("founder: identical to pro (lifetime Pro)", () => {
  assert.deepEqual(featuresForPlan("founder"), featuresForPlan("pro"));
});

test("business: everything pro has, plus integrations", () => {
  const f = featuresForPlan("business");
  assert.equal(f.businessIntegrations, true);
  assert.equal(f.removeSponsorSlot, true);
});

test("sponsor hidden exactly on pro/founder/business (mirrors SponsorSlot/SponsorBanner)", () => {
  // Web slot checks `plan !== "free"`; mobile checks planAtLeast(plan, "pro").
  for (const plan of PLANS) {
    const hiddenWeb = plan !== "free";
    const hiddenMobile = planAtLeast(plan, "pro");
    assert.equal(hiddenWeb, hiddenMobile, `web/mobile agree on ${plan}`);
    assert.equal(featuresForPlan(plan).removeSponsorSlot, hiddenWeb, plan);
  }
});

test("plan ranking: free < pro < founder < business", () => {
  assert.ok(planAtLeast("founder", "pro"), "founder unlocks all Pro gates");
  assert.ok(!planAtLeast("founder", "business"), "founder does not unlock business gates");
  assert.ok(planAtLeast("business", "pro"));
  assert.ok(!planAtLeast("free", "pro"));
  assert.ok(!planAtLeast(undefined, "pro"), "missing plan ranks as free");
});

test("plan labels", () => {
  assert.equal(planLabel("founder"), "Founder");
  assert.equal(planLabel("nonsense"), "Free");
});

test("scaffolding metadata: no core feature gated by accident", () => {
  // Free themes must exist; packs are premium polish only.
  assert.ok(THEMES.some((t) => t.tierRequired === "free"), "a free theme exists");
  assert.ok(THEMES.some((t) => t.id === "default" && t.tierRequired === "free"));
  assert.ok(WORKFLOW_PACKS.every((p) => p.tierRequired !== "business"), "packs never require business");
});
