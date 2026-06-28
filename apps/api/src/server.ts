import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { customerRoutes } from "./routes/customers.js";
import { jobRoutes } from "./routes/jobs.js";
import { appointmentRoutes } from "./routes/appointments.js";
import { dispatchRoutes } from "./routes/dispatch.js";
import { lineItemRoutes } from "./routes/lineitems.js";
import { invoiceRoutes } from "./routes/invoices.js";
import { invoiceTemplateRoutes } from "./routes/invoice-templates.js";
import { stripeWebhookRoute } from "./routes/stripe-webhook.js";
import { estimateRoutes } from "./routes/estimates.js";
import { reviewRoutes } from "./routes/reviews.js";
import { reportRoutes } from "./routes/reports.js";
import { recurringRoutes } from "./routes/recurring.js";
import { publicRoutes } from "./routes/public.js";
import { activityRoutes } from "./routes/activities.js";

const DEFAULT_JWT_SECRET = "change-me-in-production";

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && (secret === DEFAULT_JWT_SECRET || secret.length < 32)) {
    throw new Error("JWT_SECRET must be set to a strong secret before running in production.");
  }
  return secret;
}

function corsOrigins() {
  const configured = process.env.CORS_ORIGIN;
  return configured ? configured.split(",").map((origin) => origin.trim()).filter(Boolean) : true;
}

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: corsOrigins(), credentials: true });
  app.register(cookie);
  app.register(jwt, {
    secret: requireJwtSecret(),
    cookie: { cookieName: "ofp_token", signed: false },
  });
  app.register(healthRoutes);
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(customerRoutes, { prefix: "/api/customers" });
  app.register(jobRoutes, { prefix: "/api/jobs" });
  app.register(appointmentRoutes, { prefix: "/api/appointments" });
  app.register(dispatchRoutes, { prefix: "/api/dispatch" });
  app.register(lineItemRoutes, { prefix: "/api" });
  app.register(invoiceRoutes, { prefix: "/api/invoices" });
  app.register(invoiceTemplateRoutes, { prefix: "/api/invoice-template" });
  app.register(stripeWebhookRoute, { prefix: "/api" });
  app.register(estimateRoutes, { prefix: "/api/estimates" });
  app.register(reviewRoutes, { prefix: "/api/reviews" });
  app.register(reportRoutes, { prefix: "/api/reports" });
  app.register(recurringRoutes, { prefix: "/api/recurring" });
  app.register(publicRoutes, { prefix: "/api/public" });
  app.register(activityRoutes, { prefix: "/api/activities" });
  return app;
}

// Only listen when run directly (not when imported by tests).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.API_PORT ?? 3001);
  buildServer()
    .listen({ port, host: "0.0.0.0" })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
