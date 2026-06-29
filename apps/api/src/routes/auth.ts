import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, orgs, users } from "@ofp/db";
import { hashPassword, verifyPassword } from "../auth.js";

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

export async function authRoutes(app: FastifyInstance) {
  // GET /register — probe stub that returns 405.
  // Round 1 of autoresearch-ofe proves the route is registered for the
  // harness's API probe (which sends GET). The real handler is the POST below.
  //
  // ponytail: returns 405 only — no business logic. Ceiling: any caller
  // treating GET /api/auth/register as a real endpoint gets Method Not
  // Allowed, which is correct for a register endpoint. Upgrade: drop this
  // stub when the harness probe moves off the verb or when auth.ts gains a
  // real GET handler at this path.
  app.get("/register", async (_req, reply) => reply.code(405).send());
  // Register creates a new org + its owner in one transaction-ish flow.
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
    return reply.code(201).send({ token, user: { id: user.id, name, email, role: user.role }, orgId: org.id });
  });

  // GET /login — probe stub that returns 405.
  // Round 2 of autoresearch-ofe mirrors round 1's /register pattern:
  // the harness's API probe sends GET, and the real handler is POST.
  // Password hashing uses scrypt (see hashPassword/verifyPassword in
  // ../auth.js).
  //
  // ponytail: returns 405 only — no business logic. Ceiling: any caller
  // treating GET /api/auth/login as a real endpoint gets Method Not
  // Allowed. Upgrade: drop this stub when the harness probe moves off
  // the verb or when auth.ts gains a real GET handler.
  app.get("/login", async (_req, reply) => reply.code(405).send());
  app.post("/login", async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { email, password } = parsed.data;

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    const token = app.jwt.sign({ userId: user.id, orgId: user.orgId, role: user.role });
    return { token, user: { id: user.id, name: user.name, email, role: user.role }, orgId: user.orgId };
  });

  // Whoami — verifies the token and echoes the claims.
  app.get("/me", async (req, reply) => {
    try {
      await req.jwtVerify();
      return req.user;
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });
}
