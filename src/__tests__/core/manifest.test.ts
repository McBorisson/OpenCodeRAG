import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  computeFileHash,
  createEmptyManifest,
  loadManifest,
  manifestPathFor,
  normalizeFilePath,
  saveManifest,
} from "../../core/manifest.js";

async function makeTempDir(name: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

describe("manifest", () => {
  it("creates an empty manifest", () => {
    assert.deepStrictEqual(createEmptyManifest(), { files: {}, schemaVersion: 1 });
  });

  it("normalizes file paths to absolute forward-slash paths", () => {
    const normalized = normalizeFilePath("src\\test.ts");
    assert.match(normalized, /^([A-Za-z]:)?\//);
    assert.ok(!normalized.includes("\\"));
  });

  it("computes stable hashes", () => {
    assert.equal(computeFileHash("abc"), computeFileHash("abc"));
    assert.notEqual(computeFileHash("abc"), computeFileHash("abcd"));
  });

  it("returns missing status when manifest file does not exist", async () => {
    const dir = await makeTempDir("manifest-missing");
    const result = await loadManifest(dir);
    assert.equal(result.status, "missing");
    assert.deepStrictEqual(result.manifest, { files: {}, schemaVersion: 1 });
    assert.equal(result.path, manifestPathFor(dir));
  });

  it("saves and loads manifest data", async () => {
    const dir = await makeTempDir("manifest-save");
    const manifest = {
      lastIndexedAt: 123,
      files: {
        "/tmp/example.ts": {
          hash: "hash-1",
          chunkCount: 2,
          indexedAt: 123,
        },
      },
    };

    await saveManifest(dir, manifest);
    const result = await loadManifest(dir);

    assert.equal(result.status, "ok");
    assert.deepStrictEqual(result.manifest, manifest);
  });

  it("returns corrupt status for invalid JSON", async () => {
    const dir = await makeTempDir("manifest-corrupt");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(manifestPathFor(dir), "{not-json", "utf-8");

    const result = await loadManifest(dir);
    assert.equal(result.status, "corrupt");
    assert.deepStrictEqual(result.manifest, { files: {}, schemaVersion: 1 });
  });
});
