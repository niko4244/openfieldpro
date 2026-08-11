import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { customerRoutes } from "./routes/customers.js";
import { jobRoutes } from "./routes/jobs.js";
import { appointmentRoutes } from "./routes/appointments.js";
import { lineItemRoutes } from "./routes/lineitems.js";
import { invoiceRoutes } from "./routes/invoices.js";
import { stripeWebhookRoute } from "./routes/stripe-webhook.js";
import { estimateRoutes } from "./routes/estimates.js";
import { reviewRoutes } from "./routes/reviews.js";
import { reportRoutes } from "./routes/reports.js";
import { recurringRoutes } from "./routes/recurring.js";
import { publicRoutes } from "./routes/public.js";
import { portalRoutes } from "./routes/portal.js";
import { messageRoutes } from "./routes/messages.js";
import { documentRoutes } from "./routes/documents.js";
import { activityRoutes } from "./routes/activities.js";
import { syncRoutes } from "./routes/sync.js";
import { userRoutes } from "./routes/users.js";
import { photoRoutes } from "./routes/photos.js";
import { catalogRoutes } from "./routes/catalog.js";
import { equipmentRoutes } from "./routes/equipment.js";
import { notificationRoutes } from "./routes/notifications.js";
import { searchRoutes } from "./routes/search.js";
import { pluginRoutes } from "./routes/plugins.js";
import { pluginApiRoutes } from "./routes/plugin-api.js";
import { servicePlanRoutes } from "./routes/service-plans.js";
import { orgSettingsRoutes } from "./routes/org-settings.js";
import { operationRoutes } from "./routes/operations.js";
import { diagnosticRoutes } from "./routes/diagnostics.js";
import { diagnosticOfflineRoutes } from "./routes/diagnostic-offline.js";
import { diagnosticOutputRoutes } from "./routes/diagnostic-outputs.js";
import { diagnosticAuthoringGuard } from "./diagnostic-authoring-guard.js";
import { operationalAuthorizationGuard } from "./operational-authorization.js";
import { resolveCorsOrigin, resolveJwtSecret } from "./runtime-security.js";
import { applyApiSecurityHeaders } from "./security-headers.js";
import { sessionCookieAuthenticationHook } from "./session-cookie.js";
import type { HealthProbes } from "./health.js";
import {
  createOperationsClient,
  type OperationsClient,
} from "./operations-client.js";
import {
  isMaintenanceExempt,
  isMutatingMethod,
  maintenanceReaderFromEnvironment,
  type MaintenanceReader,
  WorkerDrainTracker,
} from "./maintenance.js";

export function buildServer(
  options: {
    healthProbes?: HealthProbes;
    healthProbeTimeoutMs?: number;
    operationsClient?: OperationsClient;
    maintenanceReader?: MaintenanceReader;
  } = {},
) {
  const app = Fastify({
    logger: true,
    bodyLimit: 1_048_576,
    trustProxy: process.env.TRUST_PROXY === "true",
  });
  app.register(cors, {
    origin: resolveCorsOrigin(),
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  });
  app.register(jwt, {
    secret: resolveJwtSecret(),
    sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? "12h" },
  });
  app.addHook("onRequest", sessionCookieAuthenticationHook);
  app.addHook("onSend", async (_request, reply, payload) => {
    applyApiSecurityHeaders(reply);
    return payload;
  });
  const maintenance = options.maintenanceReader ?? maintenanceReaderFromEnvironment();
  const apiDrain = new WorkerDrainTracker(maintenance);
  const activeMutations = new WeakMap<object, () => void>();
  const releaseMutation = (request: object) => {
    activeMutations.get(request)?.();
    activeMutations.delete(request);
  };
  app.addHook("preHandler", async (request, reply) => {
    if (!isMutatingMethod(request.method)) return;
    const pathname = new URL(request.raw.url ?? request.url, "http://api.internal").pathname;
    if (isMaintenanceExempt(request.method, pathname)) return;
    const finish = apiDrain.begin();
    if (!finish) {
      return reply
        .header("Cache-Control", "no-store")
        .header("Retry-After", "30")
        .code(503)
        .send({
          error: "OpenFieldPro is temporarily in maintenance mode. Please try again shortly.",
          retryable: true,
        });
    }
    activeMutations.set(request, finish);
  });
  app.addHook("onResponse", async (request) => releaseMutation(request));
  app.addHook("onRequestAbort", async (request) => releaseMutation(request));
  app.addHook("preHandler", operationalAuthorizationGuard);
  app.addHook("preHandler", diagnosticAuthoringGuard);
  app.register(healthRoutes, { probes: options.healthProbes, timeoutMs: options.healthProbeTimeoutMs });
  app.get("/internal/drain", async () => apiDrain.status());
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(customerRoutes, { prefix: "/api/customers" });
  app.register(jobRoutes, { prefix: "/api/jobs" });
  app.register(appointmentRoutes, { prefix: "/api/appointments" });
  app.register(lineItemRoutes, { prefix: "/api" });
  app.register(invoiceRoutes, { prefix: "/api/invoices" });
  app.register(stripeWebhookRoute, { prefix: "/api" });
  app.register(estimateRoutes, { prefix: "/api/estimates" });
  app.register(reviewRoutes, { prefix: "/api/reviews" });
  app.register(reportRoutes, { prefix: "/api/reports" });
  app.register(recurringRoutes, { prefix: "/api/recurring" });
  app.register(photoRoutes, { prefix: "/api/photos" });
  app.register(catalogRoutes, { prefix: "/api/catalog" });
  app.register(publicRoutes, { prefix: "/api/public" });
  app.register(portalRoutes, { prefix: "/api/portal" });
  app.register(messageRoutes, { prefix: "/api" });
  app.register(documentRoutes, { prefix: "/api" });
  app.register(activityRoutes, { prefix: "/api/activities" });
  app.register(syncRoutes);
  app.register(userRoutes, { prefix: "/api/users" });
  app.register(equipmentRoutes, { prefix: "/api/equipment" });
  app.register(diagnosticRoutes, { prefix: "/api/diagnostics" });
  app.register(diagnosticOfflineRoutes, { prefix: "/api/diagnostics" });
  app.register(diagnosticOutputRoutes, { prefix: "/api/diagnostics" });
  app.register(notificationRoutes, { prefix: "/api/notifications" });
  app.register(searchRoutes, { prefix: "/api/search" });
  app.register(pluginRoutes, { prefix: "/api/plugins" });
  app.register(pluginApiRoutes, { prefix: "/api/plugin" });
  app.register(servicePlanRoutes, { prefix: "/api/service-plans" });
  app.register(orgSettingsRoutes, { prefix: "/api/org" });
  app.register(operationRoutes, {
    prefix: "/api/operations",
    client:
      options.operationsClient ??
      createOperationsClient({
        baseUrl:
          process.env.OPERATIONS_CONTROLLER_URL ?? "http://operations-controller:3010",
        secretFile:
          process.env.OPERATIONS_CONTROLLER_SECRET_FILE ??
          "/run/secrets/openfieldpro_operations_controller",
      }),
  });
  return app;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.API_PORT ?? 3001);
  buildServer()
    .listen({ port, host: "0.0.0.0" })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
