import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { deleteOrgLogo, getOrgLogo, saveOrgLogo } from "../src/uploads.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("organization logo storage validates, replaces, reads, and deletes images", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ofp-logo-"));
  const previous = process.env.OFP_UPLOAD_DIR;
  process.env.OFP_UPLOAD_DIR = directory;
  try {
    const saved = await saveOrgLogo("org-1", { stream: Readable.from(PNG), filenameHint: "logo.png" });
    assert.equal(saved.contentType, "image/png");
    assert.equal(saved.fileSize, PNG.length);

    const stored = await getOrgLogo("org-1");
    assert.equal(stored?.contentType, "image/png");
    assert.deepEqual(stored?.buffer, PNG);

    await assert.rejects(
      saveOrgLogo("org-1", { stream: Readable.from(Buffer.from("not an image")) }),
      /PNG, JPEG, or WebP/,
    );
    assert.deepEqual((await getOrgLogo("org-1"))?.buffer, PNG);

    await deleteOrgLogo("org-1");
    assert.equal(await getOrgLogo("org-1"), null);
  } finally {
    if (previous === undefined) delete process.env.OFP_UPLOAD_DIR;
    else process.env.OFP_UPLOAD_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
