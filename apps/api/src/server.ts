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

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });
  app.register(jwt, { secret: process.env.JWT_SECRET ?? "change-me-in-production" });
  app.register(healthRoutes);
  app.register(authRoutes, { prefix: "/api/auth" });
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
