// Local-filesystem photo storage. Each function is stateless and mockable.
// Phase-5a keeps files on local disk; upgrading to S3/R2 swaps this module
// without touching the route layer.
//
// ponytail: local disk only. Ceiling: single-server, no replication. Upgrade:
// swap with an S3 client (same function signatures) and point OFP_UPLOAD_DIR
// at a FUSE mount, or replace the module entirely.

import { randomUUID } from "node:crypto";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { eq, and } from "drizzle-orm";
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

function uploadDir(): string {
  return process.env.OFP_UPLOAD_DIR ?? "./.ofp-uploads";
}

export async function savePhoto(
  orgId: string,
  jobId: string,
  fileBuffer: Buffer,
  contentType: string,
  fileName?: string,
): Promise<PhotoRecord> {
  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
  if (!job) throw Object.assign(new Error("job not found"), { statusCode: 404 });

  const ext = fileName ? extname(fileName) : "";
  const photoId = randomUUID();
  const objectKey = `ofp/${orgId}/${photoId}${ext}`;

  const dir = uploadDir();
  await mkdir(join(dir, "ofp", orgId), { recursive: true });
  await writeFile(join(dir, objectKey), fileBuffer);

  const [record] = await db
    .insert(photos)
    .values({
      id: photoId,
      orgId,
      jobId,
      objectKey,
      contentType,
      fileName: fileName ?? null,
      fileSize: fileBuffer.length,
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
  const buffer = await readFile(join(dir, record.objectKey));
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
