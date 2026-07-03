import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { IS_PRODUCTION } from "./env.js";
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
import { activityRoutes } from "./routes/activities.js";
import { syncRoutes } from "./routes/sync.js";
import { timeEntriesRoutes } from "./routes/time-entries.js";
import { userRoutes } from "./routes/users.js";
import { photoRoutes } from "./routes/photos.js";
import { catalogRoutes } from "./routes/catalog.js";
import { equipmentRoutes } from "./routes/equipment.js";
import { notificationRoutes } from "./routes/notifications.js";
import { searchRoutes } from "./routes/search.js";
import { pluginRoutes } from "./routes/plugins.js";
import { pluginApiRoutes } from "./routes/plugin-api.js";
import { techRoutes } from "./routes/tech.js";
import { dispatchRoutes } from "./routes/dispatch.js";
import { templateRoutes } from "./routes/templates.js";
import { automationRoutes } from "./routes/automation.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { orgSettingsRoutes } from "./routes/org.js";

// The well-known placeholder secret shipped in .env.example / compose defaults.
// Booting production with this means anyone can forge a token for any org/role,
// so we refuse to start rather than fail open silently.
const DEFAULT_JWT_SECRET = "change-me-in-production";

export function buildServer() {
  const secret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
  if (IS_PRODUCTION && secret === DEFAULT_JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is unset or still the default placeholder while NODE_ENV=production. " +
        "Set a strong, unique JWT_SECRET before starting OpenFieldPro in production.",
    );
  }

  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });
  app.register(jwt, { secret });

  // Central error + not-found handlers so a malformed id or any thrown error
  // becomes a clean JSON response instead of a 500 that leaks internal detail
  // (e.g. Postgres 22P02 "invalid input syntax for type uuid"). Errors are
  // still logged server-side; only the client-facing body is sanitized.
  app.setErrorHandler((err, req, reply) => {
    const anyErr = err as { statusCode?: number; code?: string; validation?: unknown };
    // A handler that explicitly set a 4xx status (e.g. our 401 throws) is honored.
    const explicit = typeof anyErr.statusCode === "number" ? anyErr.statusCode : undefined;

    // Postgres SQLSTATEs that mean "the client sent something malformed" → 400.
    //   22P02 invalid text representation (bad uuid/int), 22003 numeric range,
    //   22007/22008 bad datetime. These are user-input problems, not server bugs.
    const badInputCodes = new Set(["22P02", "22003", "22007", "22008"]);
    if (anyErr.validation || (anyErr.code && badInputCodes.has(anyErr.code))) {
      req.log.warn({ err }, "bad request");
      return reply.code(400).send({ error: "bad request" });
    }

    if (explicit && explicit >= 400 && explicit < 500) {
      return reply.code(explicit).send({ error: (err as Error).message || "request failed" });
    }

    req.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: "internal server error" });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: "not found" });
  });
  app.register(healthRoutes);
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(orgSettingsRoutes, { prefix: "/api/org" });
  app.register(customerRoutes, { prefix: "/api/customers" });
  app.register(jobRoutes, { prefix: "/api/jobs" });
  app.register(appointmentRoutes, { prefix: "/api/appointments" });
  app.register(lineItemRoutes, { prefix: "/api" });
  app.register(invoiceRoutes, { prefix: "/api/invoices" });
  app.register(stripeWebhookRoute, { prefix: "/api" }); // encapsulated raw-body parser
  app.register(estimateRoutes, { prefix: "/api/estimates" });
  app.register(reviewRoutes, { prefix: "/api/reviews" });
  app.register(reportRoutes, { prefix: "/api/reports" });
  app.register(recurringRoutes, { prefix: "/api/recurring" });
  app.register(photoRoutes, { prefix: "/api/photos" });
  app.register(catalogRoutes, { prefix: "/api/catalog" });
  app.register(publicRoutes, { prefix: "/api/public" });
  app.register(activityRoutes, { prefix: "/api/activities" });
  app.register(syncRoutes);
  app.register(timeEntriesRoutes, { prefix: "/api/time-entries" });
  app.register(userRoutes, { prefix: "/api/users" });
  app.register(equipmentRoutes, { prefix: "/api/equipment" });
  app.register(notificationRoutes, { prefix: "/api/notifications" });
  app.register(searchRoutes, { prefix: "/api/search" });
  app.register(pluginRoutes, { prefix: "/api/plugins" }); // owner-facing mgmt
  app.register(pluginApiRoutes, { prefix: "/api/plugin" }); // scoped-token surface
  app.register(techRoutes, { prefix: "/api/tech" }); // POST /api/tech/location
  app.register(dispatchRoutes, { prefix: "/api/dispatch" }); // GET /api/dispatch/state
  app.register(templateRoutes, { prefix: "/api/templates" });
  app.register(automationRoutes, { prefix: "/api/automation" });
  app.register(inventoryRoutes, { prefix: "/api/inventory" });
  return app;
}

// Only listen when run directly (not when imported by tests).
const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (isMain) {
  const port = Number(process.env.API_PORT ?? 3001);
  buildServer()
    .listen({ port, host: "0.0.0.0" })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
