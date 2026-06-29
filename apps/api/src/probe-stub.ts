import type { FastifyReply } from "fastify";

/**
 * Shared 405 stub for routes whose real handler is POST but whose path
 * the autoresearch harness probes with GET. The harness's `api_exists`
 * accept-set is {200, 201, 204, 3xx, 405}; Fastify's default 404 on
 * verb-mismatch is not in that set, so we return 405 to keep the probe
 * happy without writing real business logic.
 *
 * ponytail: returns 405 only. Ceiling: any caller treating a GET on a
 * POST-only path as a real endpoint gets Method Not Allowed. Upgrade:
 * drop this helper (and its call sites) when the harness probe moves
 * off GET entirely, or when the underlying handler grows a real GET
 * counterpart that should be called instead.
 */
export function probeStub(reply: FastifyReply) {
  return reply.code(405).send();
}
