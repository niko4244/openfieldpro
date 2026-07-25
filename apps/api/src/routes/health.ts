import type { FastifyInstance, FastifyReply } from "fastify";
import { checkHealth, defaultHealthProbes, healthProbeTimeoutMs, type HealthProbe, type HealthProbes } from "../health.js";
import { verifiedClaims } from "../operational-authorization.js";

export interface HealthRouteOptions {
  probes?: HealthProbes;
  timeoutMs?: number;
}

function singleFlight(probe: HealthProbe | undefined) {
  if (!probe) return undefined;
  let inFlight: Promise<void> | undefined;
  return () => {
    if (!inFlight) {
      const work = Promise.resolve().then(probe);
      inFlight = work;
      const clear = () => { if (inFlight === work) inFlight = undefined; };
      void work.then(clear, clear);
    }
    return inFlight;
  };
}

export async function healthRoutes(app: FastifyInstance, options: HealthRouteOptions = {}) {
  const probes = options.probes ?? defaultHealthProbes();
  const timeoutMs = options.timeoutMs ?? healthProbeTimeoutMs();
  const guardedProbes: HealthProbes = {
    postgres: singleFlight(probes.postgres)!,
    uploads: singleFlight(probes.uploads)!,
    migrations: singleFlight(probes.migrations)!,
    redis: singleFlight(probes.redis),
  };
  const readiness = () => checkHealth(guardedProbes, timeoutMs);
  const sendReadiness = async (reply: FastifyReply) => {
    const report = await readiness();
    return reply.code(report.ok ? 200 : 503).send({ ok: report.ok, service: "ofp-api", components: report.components, ts: Date.now() });
  };

  app.get("/api/health/live", async () => ({ ok: true, service: "ofp-api", ts: Date.now() }));
  app.get("/api/health/ready", async (_request, reply) => sendReadiness(reply));
  app.get("/api/health", async (_request, reply) => sendReadiness(reply));
  app.get("/api/health/details", async (request, reply) => {
    const claims = await verifiedClaims(request, reply);
    if (!claims || reply.sent) return;
    if (claims.role !== "owner") return reply.code(403).send({ error: "owner access required" });
    return sendReadiness(reply);
  });
}
