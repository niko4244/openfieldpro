import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, orgs, users } from "@ofp/db";
import { hashPassword, verifyPassword, type JwtClaims } from "../auth.js";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";
import { publicRegistrationEnabled } from "../runtime-security.js";
import { clearSessionCookie, setSessionCookie } from "../session-cookie.js";
import {
  browserAuthResponse,
  nativeAuthResponse,
  nativeLoginRequestAllowed,
} from "../auth-session-response.js";

const registerBody = z.object({
  orgName: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128),
});

const loginBody = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});

const registerRateLimit = createFixedWindowRateLimit({
  max: 5,
  windowMs: 60 * 60 * 1000,
  key: requestIpKey,
});

const loginRateLimit = createFixedWindowRateLimit({
  max: 10,
  windowMs: 15 * 60 * 1000,
  key: (request: FastifyRequest) => {
    const email = typeof (request.body as { email?: unknown } | undefined)?.email === "string"
      ? (request.body as { email: string }).email.trim().toLowerCase()
      : "unknown";
    return `${requestIpKey(request)}:${email}`;
  },
});

function signUserToken(app: FastifyInstance, user: {
  id: string;
  orgId: string;
  role: string;
  name: string;
  email: string;
}) {
  return app.jwt.sign({
    userId: user.id,
    orgId: user.orgId,
    role: user.role,
    name: user.name,
    email: user.email,
  } as Parameters<typeof app.jwt.sign>[0]);
}

function publicUser(user: { id: string; name: string; email: string; role: string }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

async function authenticateUser(email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (
    !user ||
    !user.active ||
    !user.passwordHash ||
    !(await verifyPassword(password, user.passwordHash))
  ) {
    return null;
  }
  return user;
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", { preHandler: registerRateLimit }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!publicRegistrationEnabled()) {
      return reply.code(403).send({
        error: "public registration is disabled",
        hint: "An owner can temporarily enable OFP_ALLOW_PUBLIC_REGISTRATION during controlled onboarding.",
      });
    }

    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { orgName, name, password } = parsed.data;
    const email = parsed.data.email.toLowerCase();

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) return { conflict: true as const };

      const [org] = await tx.insert(orgs).values({ name: orgName }).returning();
      const [user] = await tx
        .insert(users)
        .values({
          orgId: org.id,
          email,
          name,
          role: "owner",
          passwordHash: await hashPassword(password),
        })
        .returning();
      return { conflict: false as const, org, user };
    });

    if (result.conflict) {
      return reply.code(409).send({ error: "an account with this email already exists" });
    }

    const identity = {
      token: signUserToken(app, result.user),
      user: publicUser(result.user),
      orgId: result.org.id,
    };
    setSessionCookie(reply, identity.token);
    return reply.code(201).send(browserAuthResponse(identity));
  });

  app.post("/login", { preHandler: loginRateLimit }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const email = parsed.data.email.toLowerCase();
    const user = await authenticateUser(email, parsed.data.password);
    if (!user) return reply.code(401).send({ error: "invalid credentials" });

    const identity = {
      token: signUserToken(app, user),
      user: publicUser(user),
      orgId: user.orgId,
    };
    setSessionCookie(reply, identity.token);
    return browserAuthResponse(identity);
  });

  app.post("/native-login", { preHandler: loginRateLimit }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!nativeLoginRequestAllowed(req.headers.origin, req.headers["sec-fetch-site"])) {
      return reply.code(403).send({ error: "native login does not accept browser-origin requests" });
    }

    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const email = parsed.data.email.toLowerCase();
    const user = await authenticateUser(email, parsed.data.password);
    if (!user) return reply.code(401).send({ error: "invalid credentials" });

    return nativeAuthResponse({
      token: signUserToken(app, user),
      user: publicUser(user),
      orgId: user.orgId,
    });
  });

  app.post("/logout", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/me", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      await req.jwtVerify();
      const claims = req.user as JwtClaims;
      return publicUser({
        id: claims.userId,
        name: claims.name ?? "Team member",
        email: claims.email ?? "",
        role: claims.role,
      });
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });
}
