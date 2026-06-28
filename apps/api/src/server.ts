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
  app.register(publicRoutes, { prefix: "/api/public" });
  app.register(activityRoutes, { prefix: "/api/activities" });
  app.register(syncRoutes);
  return app;
}

// Only listen when run directly (not when imported by tests).
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
