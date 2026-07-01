// Phase 5d Wave 1a — env-driven provider init for the api process. Called
// once at server boot from apps/api/src/server.ts::buildServer. Production
// should assert OFP_PROVIDER_* != stub; left for prod hardening (ponytail).
import { initProviders } from "@ofp/shared";

export function bootProvidersFromEnv(): void {
  initProviders(process.env);
}
