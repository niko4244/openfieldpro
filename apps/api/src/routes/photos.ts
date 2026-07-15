import type { FastifyInstance, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { resolveOrgId } from "./org.js";
import { savePhoto, getPhotoFile, listJobPhotos } from "../uploads.js";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";

interface PhotoParams {
  jobId: string;
}

interface PhotoIdParams {
  photoId: string;
}

function multipartMaxBytes(): number {
  const raw = process.env.OFP_UPLOAD_MAX_BYTES;
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 25 * 1024 * 1024;
  return Math.min(n, 100 * 1024 * 1024);
}

const TOO_LARGE_CODE = /(BODY_TOO_LARGE|FILE_TOO_LARGE|TOO_LARGE)/;

const uploadRateLimit = createFixedWindowRateLimit({
  max: 60,
  windowMs: 60 * 60 * 1000,
  key: (request: FastifyRequest) => {
    const jobId = (request.params as { jobId?: string } | undefined)?.jobId ?? "unknown";
    return `${requestIpKey(request)}:${jobId}`;
  },
});

export async function photoRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: multipartMaxBytes(),
      fields: 0,
    },
  });

  app.post<{ Params: PhotoParams }>(
    "/upload/:jobId",
    { preHandler: uploadRateLimit },
    async (req, reply) => {
      const orgId = await resolveOrgId(req);
      const { jobId } = req.params;

      try {
        const file = await req.file();
        if (!file) return reply.code(400).send({ error: "no file uploaded" });

        const record = await savePhoto(orgId, jobId, {
          stream: file.file,
          filenameHint: file.filename ?? null,
        });
        return reply.code(201).send(record);
      } catch (err: unknown) {
        const error = err as { statusCode?: number; code?: string; message?: string } | null;
        if (error && typeof error.statusCode === "number") {
          return reply.code(error.statusCode).send({ error: error.message ?? "error" });
        }
        if (error && typeof error.code === "string" && TOO_LARGE_CODE.test(error.code)) {
          return reply.code(413).send({ error: "photo exceeds file size limits" });
        }
        req.log.error({ err }, "savePhoto failed");
        return reply.code(500).send({ error: "internal error" });
      }
    },
  );

  app.get<{ Params: PhotoIdParams }>(
    "/:photoId/file",
    async (req, reply) => {
      const orgId = await resolveOrgId(req);
      const { photoId } = req.params;

      try {
        const result = await getPhotoFile(photoId, orgId);
        if (!result) return reply.code(404).send({ error: "photo not found" });
        reply.header("Cache-Control", "private, max-age=300");
        return reply.type(result.record.contentType).send(result.buffer);
      } catch (err: unknown) {
        const error = err as { statusCode?: number; message?: string } | null;
        if (error && typeof error.statusCode === "number") {
          return reply.code(error.statusCode).send({ error: error.message ?? "error" });
        }
        req.log.error({ err }, "getPhotoFile failed");
        return reply.code(500).send({ error: "internal error" });
      }
    },
  );

  app.get<{ Params: PhotoParams }>(
    "/job/:jobId",
    async (req, reply) => {
      const orgId = await resolveOrgId(req);
      const { jobId } = req.params;
      return listJobPhotos(jobId, orgId);
    },
  );
}
