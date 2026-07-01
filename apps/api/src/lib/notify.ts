// Phase 5d Wave 1a — api-side notify now delegates to the shared ProviderRegistry
// in @ofp/shared. Pre-1a this file was a local NTFY + console.log fallback that
// duplicated apps/worker/src/notify.ts::notify(); the ADR's Phase 5c ponytail
// called for a hoist `when a 3rd caller appears` — provider wiring is the 3rd
// caller (the api side and the worker side both need to ship to SendGrid or
// Twilio behind the same registry), so we promote it now.
//
// ponytail: errors here PROPAGATE through (no try/catch around the provider
//   send) so that apps/api/src/lib/events.ts::evaluateRulesForEvent's catch
//   block can UPDATE the automation_runs audit row to status='failed'. The
//   pre-1a swallow-log-then-return-void was a BLOCKING bug surfaced in the
//   earlier Phase 5c review pass — Wave 1a fixes it by removing the swallow.
//
// ponytail: `subject` is optional in notify() because SMS sends do not have
//   one. ProviderRegistry::getSms().send() ignores the field; callers in
//   events.ts thread through the rendered subject only for email channel.
//   Ceiling: split into notifyEmail and notifySms if the contracts diverge.
import { ProviderRegistry, type DeliveryResult } from "@ofp/shared";

export async function notify(
  subject: string | undefined,
  body: string,
  opts: { channel?: "email" | "sms"; to?: string } = {},
): Promise<DeliveryResult> {
  const channel = opts.channel ?? "email";
  const to = opts.to ?? process.env.OFP_NOTIFY_DEFAULT_TO ?? "preview@localhost";
  const provider = channel === "sms" ? ProviderRegistry.getSms() : ProviderRegistry.getEmail();
  return provider.send({ to, subject, body });
}
