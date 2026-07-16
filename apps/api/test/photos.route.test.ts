// Photo routes test.
// Mocks the uploads module so no file I/O or database calls happen.
// Uses app.inject() — no real server listening.

import { test, mock } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// 1. Mock the uploads module BEFORE importing the server.
//    mock.module intercepts the specifier as resolved from this test file.
// ---------------------------------------------------------------------------

const fakePhoto = {
  id: "test-photo-id",
  orgId: "org-1",
  jobId: "job-1",
  objectKey: "ofp/org-1/test-photo-id.jpg",
  contentType: "image/jpeg",
  fileName: "test.jpg",
  fileSize: 1024,
  uploadedAt: new Date("2026-06-28T00:00:00.000Z"),
  createdAt: new Date("2026-06-28T00:00:00.000Z"),
};

const mockSavePhoto = mock.fn();
const mockGetPhotoFile = mock.fn();
const mockListJobPhotos = mock.fn();
const mockSaveOrgLogo = mock.fn();
const mockGetOrgLogo = mock.fn();
const mockDeleteOrgLogo = mock.fn();

mock.module("../src/uploads.js", {
  namedExports: {
    savePhoto: mockSavePhoto,
    getPhotoFile: mockGetPhotoFile,
    listJobPhotos: mockListJobPhotos,
    saveOrgLogo: mockSaveOrgLogo,
    getOrgLogo: mockGetOrgLogo,
    deleteOrgLogo: mockDeleteOrgLogo,
  },
});

// buildServer triggers the module graph to load, including photoRoutes,
// which in turn imports from the now-mocked uploads module.
const { buildServer } = await import("../src/server.js");

// ---------------------------------------------------------------------------
// 2. Helper: fake multipart body (minimal valid multipart/form-data)
// ---------------------------------------------------------------------------

function multipartBody(boundary: string, filename: string, contentType: string, content: string): string {
  return [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: ${contentType}`,
    "",
    content,
    `--${boundary}--`,
  ].join("\r\n");
}

// Drain a stream into a Buffer. Mirrors what the real savePhoto does
// during streaming, so the mock records `fileSize` reflect what the route
// would actually have written.
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// 3. Tests
// ---------------------------------------------------------------------------

test("POST /upload/:jobId — upload creates a photo record", async () => {
  mockSavePhoto.mock.mockImplementation(
    async (
      _orgId: string,
      _jobId: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: { stream: NodeJS.ReadableStream; filenameHint?: string | null },
    ) => {
      const buf = await streamToBuffer(input.stream);
      return {
        ...fakePhoto,
        fileName: input.filenameHint ?? null,
        fileSize: buf.length,
      };
    },
  );

  const app = buildServer();
  const boundary = "----TestBoundary98765";
  const body = multipartBody(boundary, "photo.jpg", "image/jpeg", "fake-image-content");

  const res = await app.inject({
    method: "POST",
    url: "/api/photos/upload/job-1",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "x-org-id": "org-1",
    },
    body,
  });

  assert.equal(res.statusCode, 201);
  const data = JSON.parse(res.body);
  assert.equal(data.id, "test-photo-id");
  assert.equal(data.jobId, "job-1");
  assert.equal(data.orgId, "org-1");
  assert.equal(data.fileName, "photo.jpg");
  assert.ok(data.fileSize);

  // Verify the mock was called with the new SavePhotoInput shape, not
  // raw bytes + caller-supplied Content-Type.
  const call = mockSavePhoto.mock.calls[0];
  assert.ok(call);
  assert.equal(call.arguments[0], "org-1"); // orgId
  assert.equal(call.arguments[1], "job-1"); // jobId
  assert.ok(call.arguments[2]); // third arg is now an object
  assert.equal(call.arguments[2].filenameHint, "photo.jpg");
  assert.ok(call.arguments[2].stream);

  await app.close();
});

test("GET /:photoId/file — returns photo file with correct content-type", async () => {
  mockGetPhotoFile.mock.mockImplementation(async () => ({
    record: fakePhoto,
    buffer: Buffer.from("fake-image-bytes"),
  }));

  const app = buildServer();

  const res = await app.inject({
    method: "GET",
    url: "/api/photos/test-photo-id/file",
    headers: { "x-org-id": "org-1" },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "image/jpeg");
  assert.equal(res.body, "fake-image-bytes");

  await app.close();
});

test("GET /:photoId/file — 404 for non-existent photo", async () => {
  mockGetPhotoFile.mock.mockImplementation(async () => null);

  const app = buildServer();

  const res = await app.inject({
    method: "GET",
    url: "/api/photos/nonexistent/file",
    headers: { "x-org-id": "org-1" },
  });

  assert.equal(res.statusCode, 404);
  assert.deepEqual(JSON.parse(res.body), { error: "photo not found" });

  await app.close();
});

test("GET /job/:jobId — lists photos for a job", async () => {
  const photos = [
    { ...fakePhoto, id: "photo-1", fileName: "front.jpg" },
    { ...fakePhoto, id: "photo-2", fileName: "side.jpg" },
  ];

  mockListJobPhotos.mock.mockImplementation(async () => photos);

  const app = buildServer();

  const res = await app.inject({
    method: "GET",
    url: "/api/photos/job/job-1",
    headers: { "x-org-id": "org-1" },
  });

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.length, 2);
  assert.equal(data[0].fileName, "front.jpg");
  assert.equal(data[1].fileName, "side.jpg");

  const call = mockListJobPhotos.mock.calls[0];
  assert.ok(call);
  assert.equal(call.arguments[0], "job-1");
  assert.equal(call.arguments[1], "org-1");

  await app.close();
});
