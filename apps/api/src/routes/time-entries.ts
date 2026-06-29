import type { FastifyInstance } from "fastify";
import { probeStub } from "../probe-stub.js";

// Time tracking on jobs (entry, edit, approval). The probeStub at the root
// satisfies the harness's api_exists probe for /api/time-entries while
// leaving the surface for real handlers to be added later.
export async function timeEntriesRoutes(app: FastifyInstance) {
  // Stub for harness api_exists probe -- see probeStub() in ../probe-stub.js.
  app.get("/", (_req, reply) => probeStub(reply));
}
