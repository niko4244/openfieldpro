// Local-filesystem photo storage. Each function is stateless and mockable.
// Phase-5a keeps files on local disk; upgrading to S3/R2 swaps this module
// without touching the route layer.
//
// ponytail: local disk only. Ceiling: single-server, no replication. Upgrade:
// swap with an S3 client (same function signatures) and point OFP_UPLOAD_DIR
// at a FUSE mount, or replace the module entirely.

import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, extname } from "node:path";
import type { Readable } from "node:stream";
import { eq, and } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { db, jobs, photos } from "@ofp/db";

export interface PhotoRecord {
  id: string;
  orgId: string;
  jobId: string;
  objectKey: string;
  contentType: string;
  fileName: string | null;
  fileSize: number | null;
  uploadedAt: Date;
  createdAt: Date;
}

export interface SavePhotoInput {
  stream: Readable;
  filenameHint?: string | null;
}

// Allowlist of MIME types we accept as photos. Tight enough to prevent
// obvious bypasses (executable uploads with spoofed Content-Type).
const ALLOWED_MIME = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

// Default 25 MiB per upload. Override with OFP_UPLOAD_MAX_BYTES. Hard cap
// at 100 MiB so the persisted byte count never gets close to 2^53.
const MAX_BYTES_DEFAULT = 25 * 1024 * 1024;
const MAX_BYTES_CEIL = 100 * 1024 * 1024;

function maxBytes(): number {
  const raw = process.env.OFP_UPLOAD_MAX_BYTES;
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return MAX_BYTES_DEFAULT;
  return Math.min(n, MAX_BYTES_CEIL);
}

function uploadDir(): string {
  return process.env.OFP_UPLOAD_DIR ?? "./.ofp-uploads";
}

// Mirrors the Object.assign(new Error(...), { statusCode }) pattern that
// the rest of OFP uses so existing Fastify error handlers don't need an
// update. See routes/photos.ts.
function httpError(status: number, message: string): Error & { statusCode: number } {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = status;
  return e;
}

// Head bytes reserved for magic-byte detection. 4 KiB covers all common
// photo-format signatures (JPEG, PNG, WebP, HEIC, HEIF, GIF).
const SNIFF_HEAD_BYTES = 4096;

/**
 * Save a photo to local storage.
 *
 * Closes audit findings:
 *   - HIGH-7 (OOM): streams the upload to disk instead of buffering.
 *   - HIGH-8 (MIME spoofing): uses file-type magic-byte sniffing on the
 *     first ~4 KiB of the upload. Caller-supplied Content-Type is dropped.
 *   - MEDIUM-9 (FS path leak): FS errors are surfaced as a generic 500
 *     instead of letting raw Node ENOENT/EACCES text reach the client.
 */
export async function savePhoto(
  orgId: string,
  jobId: string,
  input: SavePhotoInput,
): Promise<PhotoRecord> {
  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
  if (!job) throw httpError(404, "job not found");

  const limit = maxBytes();
  const ext = input.filenameHint ? extname(input.filenameHint) : "";
  // ext can include up to ~8 chars (".tar.gz" is 7) — anything larger is malformed.
  if (ext && ext.length > 8) throw httpError(400, "filename extension too long");
  const trimmedHint = input.filenameHint ? input.filenameHint.slice(0, 200) : null;

  const photoId = randomUUID();
  const objectKey = `ofp/${orgId}/${photoId}${ext}`;
  const dir = uploadDir();
  const absDest = join(dir, objectKey);
  const absDir = join(dir, "ofp", orgId);

  // Make the directory tree first. Convert any FS error to a generic 500
  // so the client never sees an absolute path in the response.
  try {
    await mkdir(absDir, { recursive: true });
  } catch {
    throw httpError(500, "internal storage error");
  }

  // Stream to disk while keeping the first 4096 bytes for magic-byte sniff.
  //
  // A single `settled` flag guarantees that whichever handler trips first
  // wins the reject race — important because destroying the source/target
  // streams can fire 'error' handlers after we already rejected.
  //
  // Backpressure: we pause the source while the disk-buffer is full and
  // resume on 'drain'. Without this, slow disks would queue hundreds of
  // MiB in V8 heap.
  let total = 0;
  let head: Buffer = Buffer.alloc(0);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (status: number, message: string): void => {
      if (settled) return;
      settled = true;
      reject(httpError(status, message));
    };
    const target = createWriteStream(absDest);

    input.stream.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > limit) {
        input.stream.destroy();
        target.destroy();
        rm(absDest, { force: true }).catch(() => {});
        settle(413, `photo exceeds maximum size of ${limit} bytes`);
        return;
      }
      if (head.length < SNIFF_HEAD_BYTES) {
        const need = SNIFF_HEAD_BYTES - head.length;
        head = Buffer.concat([head, chunk], head.length + Math.min(chunk.length, need));
      }
      if (!target.write(chunk)) {
        input.stream.pause();
      }
    });
    input.stream.on("error", () => {
      target.destroy();
      rm(absDest, { force: true }).catch(() => {});
      settle(500, "internal storage error");
    });
    input.stream.on("end", () => {
      target.end();
    });
    target.on("error", () => {
      input.stream.destroy();
      rm(absDest, { force: true }).catch(() => {});
      settle(500, "internal storage error");
    });
    target.on("finish", () => resolve());
    target.on("drain", () => input.stream.resume());
  });

  // Distinguish an empty body (no bytes written) from a body whose
  // magic-byte sniff fails. Empty → 400; sniff-fail → 415.
  if (total === 0) throw httpError(400, "empty file");

  // Magic-byte sniff on the accumulated head.
  const detected = await fileTypeFromBuffer(head);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    await rm(absDest, { force: true }).catch(() => {});
    throw httpError(415, `unsupported content-type: ${detected ? detected.mime : "unknown"}`);
  }

  const [record] = await db
    .insert(photos)
    .values({
      id: photoId,
      orgId,
      jobId,
      objectKey,
      contentType: detected.mime,
      fileName: trimmedHint,
      fileSize: total,
    })
    .returning();

  return record as PhotoRecord;
}

export async function getPhotoFile(
  photoId: string,
  orgId: string,
): Promise<{ record: PhotoRecord; buffer: Buffer } | null> {
  const [record] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.orgId, orgId)))
    .limit(1);

  if (!record) return null;

  const dir = uploadDir();
  let buffer: Buffer;
  try {
    buffer = await readFile(join(dir, record.objectKey));
  } catch {
    throw httpError(500, "internal storage error");
  }
  return { record: record as PhotoRecord, buffer };
}

export async function listJobPhotos(
  jobId: string,
  orgId: string,
): Promise<PhotoRecord[]> {
  const rows = await db
    .select()
    .from(photos)
    .where(and(eq(photos.jobId, jobId), eq(photos.orgId, orgId)))
    .orderBy(photos.uploadedAt);

  return rows as PhotoRecord[];
}
