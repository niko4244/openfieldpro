// Photo upload/serve/list routes.
//
// Require auth via resolveOrgId (JWT w/ dev fallback). Multipart parsing is
// scoped to this plugin via @fastify/multipart so it doesn't affect other routes.

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import multipart from "@fastify/multipart";
import { resolveOrgId } from "./org.js";
import { savePhoto, getPhotoFile, listJobPhotos } from "../uploads.js";

interface PhotoParams {
  jobId: string;
}

interface PhotoIdParams {
  photoId: string;
}

// Mirror OFP_UPLOAD_MAX_BYTES (default 25 MiB, hard 100 MiB) so the
// @fastify/multipart abort trips at the same threshold that the storage
// layer enforces. If the parser aborts, the route's catch handler
// converts the upstream error to 413 with a sanitized body.
function multipartMaxBytes(): number {
  const raw = process.env.OFP_UPLOAD_MAX_BYTES;
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 25 * 1024 * 1024;
  return Math.min(n, 100 * 1024 * 1024);
}

// @fastify/multipart (v9) trips a *_TOO_LARGE error when limits.fileSize
// is exceeded. That error carries a `code`, not `statusCode`, so the
// catch handler in the upload route maps known oversize codes to 413.
// The substring catches BODY_TOO_LARGE, FILE_TOO_LARGE, REQUEST_FILE_TOO_LARGE,
// and any future variant Fastify / multipart ship.
const TOO_LARGE_CODE = /(BODY_TOO_LARGE|FILE_TOO_LARGE|TOO_LARGE)/;

export async function photoRoutes(app: FastifyInstance) {
  // Scoped multipart — only /api/photos/* can handle file uploads.
  await app.register(multipart, {
    limits: {
      fileSize: multipartMaxBytes(),
    },
  });

  // POST /api/photos/upload/:jobId — multipart file upload
  app.post(
    "/upload/:jobId",
    async (req: FastifyRequest<{ Params: PhotoParams }>, reply: FastifyReply) => {
      const orgId = await resolveOrgId(req);
      const { jobId } = req.params;

      try {
        const file = await req.file();
        if (!file) {
          return reply.code(400).send({ error: "no file uploaded" });
        }

        // Stream the upload through the storage layer — no in-memory
        // toBuffer(). Magic-byte sniff and size ceiling live in
        // apps/api/src/uploads.ts.
        const record = await savePhoto(orgId, jobId, {
          stream: file.file,
          filenameHint: file.filename ?? null,
        });

        return reply.code(201).send(record);
      } catch (err: unknown) {
        const e = err as { statusCode?: number; code?: string; message?: string } | null;
        if (e && typeof e.statusCode === "number") {
          return reply.code(e.statusCode).send({ error: e.message ?? "error" });
        }
        // Fastify multipart's oversize errors use `code`, not statusCode.
        if (e && typeof e.code === "string" && TOO_LARGE_CODE.test(e.code)) {
          return reply.code(413).send({ error: "photo exceeds file size limits" });
        }
        req.log.error({ err }, "savePhoto failed");
        return reply.code(500).send({ error: "internal error" });
      }
    },
  );

  // GET /api/photos/:photoId/file — serve photo file
  app.get(
    "/:photoId/file",
    async (req: FastifyRequest<{ Params: PhotoIdParams }>, reply: FastifyReply) => {
      const orgId = await resolveOrgId(req);
      const { photoId } = req.params;

      try {
        const result = await getPhotoFile(photoId, orgId);
        if (!result) {
          return reply.code(404).send({ error: "photo not found" });
        }
        return reply.type(result.record.contentType).send(result.buffer);
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string } | null;
        if (e && typeof e.statusCode === "number") {
          return reply.code(e.statusCode).send({ error: e.message ?? "error" });
        }
        req.log.error({ err }, "getPhotoFile failed");
        return reply.code(500).send({ error: "internal error" });
      }
    },
  );

  // GET /api/photos/job/:jobId — list all photos for a job
  // NOTE: this MUST be registered after `/:photoId/file` because Fastify
  // matches routes in order, and `job/:jobId` would be caught by `:photoId`.
  app.get(
    "/job/:jobId",
    async (req: FastifyRequest<{ Params: PhotoParams }>, reply: FastifyReply) => {
      const orgId = await resolveOrgId(req);
      const { jobId } = req.params;
      return listJobPhotos(jobId, orgId);
    },
  );
}
