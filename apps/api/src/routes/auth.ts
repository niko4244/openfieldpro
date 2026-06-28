import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, orgs, users } from "@ofp/db";
import { hashPassword, verifyPassword } from "../auth.js";

const COOKIE_NAME = "ofp_token";
const WEEK_SECONDS = 60 * 60 * 24 * 7;

const registerBody = z.object({
  orgName: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function secureCookieEnabled() {
  if (process.env.SESSION_COOKIE_SECURE) return process.env.SESSION_COOKIE_SECURE === "true";
  return process.env.NODE_ENV === "production";
}

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookieEnabled(),
    maxAge: WEEK_SECONDS,
  });
}

export async function authRoutes(app: FastifyInstance) {
  // Register creates a new org + its owner, then starts a secure browser session.
  app.post("/register", async (req, reply) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { orgName, name, email, password } = parsed.data;

    const [org] = await db.insert(orgs).values({ name: orgName }).returning();
    const [user] = await db
      .insert(users)
      .values({
        orgId: org.id,
        email,
        name,
        role: "owner",
        passwordHash: await hashPassword(password),
      })
      .returning();

    const token = app.jwt.sign({ userId: user.id, orgId: org.id, role: user.role });
    setSessionCookie(reply, token);
    return reply.code(201).send({ token, user: { id: user.id, name, email, role: user.role }, orgId: org.id });
  });

  app.post("/login", async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { email, password } = parsed.data;

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    const token = app.jwt.sign({ userId: user.id, orgId: user.orgId, role: user.role });
    setSessionCookie(reply, token);
    return { token, user: { id: user.id, name: user.name, email, role: user.role }, orgId: user.orgId };
  });

  app.post("/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  // Whoami — verifies bearer-token or cookie-based sessions and echoes the claims.
  app.get("/me", async (req, reply) => {
    try {
      await req.jwtVerify();
      return req.user;
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });
}
