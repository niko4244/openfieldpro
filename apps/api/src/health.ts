import { randomUUID } from "node:crypto";
import { open, mkdir, readFile, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@ofp/db";

type ComponentStatus = "ok" | "failed" | "skipped";
type ComponentName = "postgres" | "uploads" | "migrations" | "redis";

export type HealthProbe = () => Promise<void>;

export interface HealthProbes {
  postgres: HealthProbe;
  uploads: HealthProbe;
  migrations: HealthProbe;
  redis?: HealthProbe;
}

export type HealthSqlExecutor = (query: SQL) => Promise<unknown>;

export interface HealthReport {
  ok: boolean;
  components: Record<ComponentName, ComponentStatus>;
}

const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 10_000;

export function healthProbeTimeoutMs(value = process.env.OFP_HEALTH_PROBE_TIMEOUT_MS) {
  const configured = Number(value);
  if (!Number.isFinite(configured)) return 2_000;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, configured));
}

function withinTimeout(probe: HealthProbe, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("health probe timed out")), timeoutMs);
    Promise.resolve()
      .then(probe)
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

async function runProbe(probe: HealthProbe | undefined, timeoutMs: number): Promise<ComponentStatus> {
  if (!probe) return "skipped";
  try {
    await withinTimeout(probe, timeoutMs);
    return "ok";
  } catch {
    return "failed";
  }
}

export async function checkHealth(probes: HealthProbes, timeoutMs = healthProbeTimeoutMs()): Promise<HealthReport> {
  const [postgres, uploads, migrations, redis] = await Promise.all([
    runProbe(probes.postgres, timeoutMs),
    runProbe(probes.uploads, timeoutMs),
    runProbe(probes.migrations, timeoutMs),
    runProbe(probes.redis, timeoutMs),
  ]);
  const components = { postgres, uploads, migrations, redis };
  return { ok: Object.values(components).every((status) => status !== "failed"), components };
}

async function postgresProbe() {
  await db.execute(sql`select 1`);
}

async function uploadsProbe() {
  const directory = process.env.OFP_UPLOAD_DIR ?? "./.ofp-uploads";
  const path = join(directory, `.health-${randomUUID()}`);
  await mkdir(directory, { recursive: true, mode: 0o750 });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.sync();
  } finally {
    await handle?.close();
    await rm(path, { force: true });
  }
}

function migrationParityProbe(execute: HealthSqlExecutor): HealthProbe {
  return async () => {
    const journal = JSON.parse(await readFile(new URL("../../../packages/db/drizzle/meta/_journal.json", import.meta.url), "utf8")) as {
      entries: Array<{ when: number }>;
    };
    const expected = new Set(journal.entries.map(({ when }) => String(when)));
    const result = await execute(sql`select created_at::text from ${sql.identifier("drizzle")}.${sql.identifier("__drizzle_migrations")}`);
    const applied = new Set((result as unknown as Array<{ created_at: string }>).map(({ created_at }) => created_at));
    if (applied.size !== expected.size || [...expected].some((timestamp) => !applied.has(timestamp))) {
      throw new Error("migration parity check failed");
    }
  };
}

function redisCommand(...arguments_: string[]) {
  return `*${arguments_.length}\r\n${arguments_.map((value) => `$${Buffer.byteLength(value)}\r\n${value}\r\n`).join("")}`;
}

async function redisProbe(url: string, timeoutMs: number) {
  const target = new URL(url);
  if (target.protocol !== "redis:" || !target.hostname) throw new Error("invalid Redis URL");
  const port = target.port ? Number(target.port) : 6379;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid Redis port");
  const credentials = target.username || target.password
    ? [decodeURIComponent(target.username) || "default", decodeURIComponent(target.password)]
    : [];

  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: target.hostname, port });
    let response = "";
    const done = (error?: Error) => {
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.once("connect", () => socket.write(`${credentials.length ? redisCommand("AUTH", ...credentials) : ""}${redisCommand("PING")}`));
    socket.setTimeout(timeoutMs, () => done(new Error("Redis probe timed out")));
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (response.startsWith("-")) done(new Error("Redis probe failed"));
      else if (response.includes("+PONG\r\n")) done();
    });
    socket.once("error", () => done(new Error("Redis probe failed")));
  });
}

export function defaultHealthProbes(options: { execute?: HealthSqlExecutor } = {}): HealthProbes {
  const redisUrl = process.env.REDIS_URL?.trim();
  const timeoutMs = healthProbeTimeoutMs();
  const execute = options.execute ?? ((query: SQL) => db.execute(query));
  return {
    postgres: postgresProbe,
    uploads: uploadsProbe,
    migrations: migrationParityProbe(execute),
    ...(redisUrl ? { redis: () => redisProbe(redisUrl, timeoutMs) } : {}),
  };
}
