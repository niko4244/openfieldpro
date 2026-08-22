import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// Windows file systems (Defender/indexer) can briefly hold a just-written temp
// file, making an immediate unlink fail with EBUSY/EPERM. Retry cleanup so the
// test does not flake on transient locks.
const sleepShared = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms: number) {
  Atomics.wait(sleepShared, 0, 0, ms);
}
function removeDirRetry(dir: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt >= 4 || !(error instanceof Error) || !/EBUSY|EPERM|ENOTEMPTY/.test(error.message)) throw error;
      sleepSync(100 * 2 ** attempt);
    }
  }
}
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createOperationsClient,
  OperationsControllerUnavailableError,
  readOperationsSecret,
  type OperationsClient,
} from "../src/operations-client.js";
import { buildServer } from "../src/server.js";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function withAuthenticatedApp(
  role: "owner" | "dispatcher",
  operationsClient: OperationsClient,
  run: (app: ReturnType<typeof buildServer>, token: string) => Promise<void>,
) {
  const priorNodeEnv = process.env.NODE_ENV;
  const priorJwtSecret = process.env.JWT_SECRET;
  const priorCorsOrigin = process.env.CORS_ORIGIN;
  process.env.NODE_ENV = "production";
  process.env.JWT_SECRET = "j".repeat(32);
  process.env.CORS_ORIGIN = "https://openfieldpro.test";
  const app = buildServer({ operationsClient });
  try {
    await app.ready();
    const token = app.jwt.sign({ userId: `${role}-1`, orgId: "org-1", role });
    await run(app, token);
  } finally {
    await app.close();
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
    if (priorJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorJwtSecret;
    if (priorCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = priorCorsOrigin;
  }
}

test("operations client rejects unsafe controller URLs", () => {
  assert.throws(
    () =>
      createOperationsClient({
        baseUrl: "ftp://controller.internal",
        secretFile: "unused",
      }),
    /http or https/,
  );
  assert.throws(
    () =>
      createOperationsClient({
        baseUrl: "http://user:password@controller.internal",
        secretFile: "unused",
      }),
    /credentials/,
  );
  assert.throws(
    () =>
      createOperationsClient({
        baseUrl: "http://controller.internal/unexpected",
        secretFile: "unused",
      }),
    /origin only/,
  );
});

test("operations client rejects mounted secrets shorter than 32 bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofp-operations-"));
  try {
    const secretFile = join(dir, "controller-secret");
    writeFileSync(secretFile, "too-short\n", { mode: 0o600 });
    assert.throws(() => readOperationsSecret(secretFile), /at least 32 bytes/);
  } finally {
    removeDirRetry(dir);
  }
});

test("backup uses only its fixed controller path and mounted secret", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ofp-operations-"));
  try {
    const secretFile = join(dir, "controller-secret");
    const secret = "s".repeat(32);
    writeFileSync(secretFile, `${secret}\n`, { mode: 0o600 });
    let request: { url: string; init?: RequestInit } | undefined;
    const client = createOperationsClient({
      baseUrl: "http://controller.internal",
      secretFile,
      fetch: async (input, init) => {
        request = { url: String(input), init };
        return Response.json(
          {
            id: "f2764df8-f107-4a3e-8043-a497c06b52cc",
            kind: "backup",
            state: "queued",
            requestedAt: "2026-07-25T12:00:00.000Z",
          },
          { status: 202 },
        );
      },
    });

    const operation = await client.backup({ label: "nightly" }, "request-key");

    assert.equal(request?.url, "http://controller.internal/v1/backups");
    assert.equal(request?.init?.method, "POST");
    const headers = new Headers(request?.init?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${secret}`);
    assert.equal(headers.get("idempotency-key"), "request-key");
    assert.deepEqual(JSON.parse(String(request?.init?.body)), { label: "nightly" });
    assert.equal(operation.kind, "backup");
  } finally {
    removeDirRetry(dir);
  }
});

test("operations client never forwards a mutation across a redirect", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ofp-operations-"));
  const forwarded: Array<{ body: string; idempotencyKey?: string }> = [];
  const target = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    forwarded.push({
      body: Buffer.concat(chunks).toString("utf8"),
      idempotencyKey: request.headers["idempotency-key"] as string | undefined,
    });
    response.writeHead(202, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id: "f2764df8-f107-4a3e-8043-a497c06b52cc",
        kind: "backup",
        state: "queued",
        requestedAt: "2026-07-25T12:00:00.000Z",
      }),
    );
  });
  const targetUrl = await listen(target);
  const redirect = createServer((_request, response) => {
    response.writeHead(307, { location: `${targetUrl}/captured` });
    response.end();
  });
  const redirectUrl = await listen(redirect);

  try {
    const secretFile = join(dir, "controller-secret");
    writeFileSync(secretFile, `${"s".repeat(32)}\n`, { mode: 0o600 });
    const client = createOperationsClient({ baseUrl: redirectUrl, secretFile });

    await assert.rejects(
      client.backup({ label: "nightly" }, "redirect-request-1"),
      OperationsControllerUnavailableError,
    );
    assert.deepEqual(forwarded, []);
  } finally {
    await close(redirect);
    await close(target);
    removeDirRetry(dir);
  }
});

test("operations client cancels an oversized chunked response before reading it all", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ofp-operations-"));
  try {
    const secretFile = join(dir, "controller-secret");
    writeFileSync(secretFile, `${"s".repeat(32)}\n`, { mode: 0o600 });
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        if (pulls > 10) return controller.close();
        controller.enqueue(new Uint8Array(16_384).fill(0x61));
      },
      cancel() {
        cancelled = true;
      },
    });
    const client = createOperationsClient({
      baseUrl: "http://controller.internal",
      secretFile,
      fetch: async () => new Response(body, { status: 200 }),
    });

    await assert.rejects(client.status(), OperationsControllerUnavailableError);
    assert.equal(cancelled, true);
    assert.ok(pulls < 10, `expected early cancellation, received ${pulls} chunks`);
  } finally {
    removeDirRetry(dir);
  }
});

test("operations client sanitizes missing and failed response streams", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ofp-operations-"));
  try {
    const secretFile = join(dir, "controller-secret");
    writeFileSync(secretFile, `${"s".repeat(32)}\n`, { mode: 0o600 });
    const responses = [
      new Response(null, { status: 200 }),
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("sensitive stream failure"));
          },
        }),
        { status: 200 },
      ),
    ];

    for (const response of responses) {
      const client = createOperationsClient({
        baseUrl: "http://controller.internal",
        secretFile,
        fetch: async () => response,
      });
      await assert.rejects(client.status(), (error) => {
        assert(error instanceof OperationsControllerUnavailableError);
        assert.equal(error.message, "operations controller unavailable");
        return true;
      });
    }
  } finally {
    removeDirRetry(dir);
  }
});

test("operations proxy rejects non-owner mutations before calling the controller", async () => {
  let calls = 0;
  const operationsClient = {
    backup: async () => {
      calls++;
      throw new Error("must not be called");
    },
  } as unknown as OperationsClient;
  await withAuthenticatedApp("dispatcher", operationsClient, async (app, token) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/operations/backups",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "backup-request-1",
      },
      payload: { label: "nightly" },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(calls, 0);
  });
});

test("operations proxy rejects malformed and extra body fields", async () => {
  let calls = 0;
  const operationsClient = {
    backup: async () => {
      calls++;
      throw new Error("must not be called");
    },
  } as unknown as OperationsClient;

  await withAuthenticatedApp("owner", operationsClient, async (app, token) => {
    for (const payload of [{ label: "" }, { label: "nightly", command: "rm -rf /" }]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/operations/backups",
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": "backup-request-1",
        },
        payload,
      });
      assert.equal(response.statusCode, 400);
    }
    assert.equal(calls, 0);
  });
});

test("operations proxy sanitizes an unavailable controller response", async () => {
  const operationsClient = {
    status: async () => {
      throw new OperationsControllerUnavailableError(
        "connect ECONNREFUSED http://controller.internal secret=do-not-leak",
      );
    },
  } as unknown as OperationsClient;

  await withAuthenticatedApp("owner", operationsClient, async (app, token) => {
    const response = await app.inject({
      method: "GET",
      url: "/api/operations/status",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { error: "operations controller unavailable" });
    assert.equal(response.body.includes("controller.internal"), false);
    assert.equal(response.body.includes("do-not-leak"), false);
  });
});

test("operations proxy has no arbitrary command route", async () => {
  await withAuthenticatedApp("owner", {} as OperationsClient, async (app, token) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/operations/command",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "command-request-1",
      },
      payload: { command: "whoami" },
    });
    assert.equal(response.statusCode, 404);
  });
});

test("operations proxy rejects every query string before calling the controller", async () => {
  let calls = 0;
  const operationsClient = {
    status: async () => {
      calls++;
      return { contractVersion: "v1", status: "ready", maintenance: false };
    },
    backup: async () => {
      calls++;
      return {
        id: "f2764df8-f107-4a3e-8043-a497c06b52cc",
        kind: "backup",
        state: "queued",
        requestedAt: "2026-07-25T12:00:00.000Z",
      };
    },
  } as OperationsClient;

  await withAuthenticatedApp("owner", operationsClient, async (app, token) => {
    const getResponse = await app.inject({
      method: "GET",
      url: "/api/operations/status?command=whoami",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(getResponse.statusCode, 400);
    assert.deepEqual(getResponse.json(), { error: "invalid operation request" });

    const postResponse = await app.inject({
      method: "POST",
      url: "/api/operations/backups?command=whoami",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "query-request-1",
      },
      payload: { label: "nightly" },
    });
    assert.equal(postResponse.statusCode, 400);
    assert.deepEqual(postResponse.json(), { error: "invalid operation request" });
    assert.equal(calls, 0);
  });
});

test("operations client rejects an unapproved controller lifecycle state", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ofp-operations-"));
  try {
    const secretFile = join(dir, "controller-secret");
    writeFileSync(secretFile, `${"s".repeat(32)}\n`, { mode: 0o600 });
    const client = createOperationsClient({
      baseUrl: "http://controller.internal",
      secretFile,
      fetch: async () =>
        Response.json({
          id: "f2764df8-f107-4a3e-8043-a497c06b52cc",
          kind: "backup",
          state: "running",
          requestedAt: "2026-07-25T12:00:00.000Z",
        }),
    });

    await assert.rejects(
      client.backup({ label: "nightly" }, "request-key"),
      OperationsControllerUnavailableError,
    );
  } finally {
    removeDirRetry(dir);
  }
});

test("Caddy does not expose the internal v1 controller", () => {
  for (const name of ["Caddyfile", "Caddyfile.prod"]) {
    const caddyfile = readFileSync(
      new URL(`../../../infra/${name}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(caddyfile, /\/v1(?:\/|\*)/);
    assert.doesNotMatch(caddyfile, /operations-controller/);
  }
});
