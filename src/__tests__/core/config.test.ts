import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, DEFAULT_CONFIG } from "../../core/config.js";

describe("loadConfig", () => {
  let tmpFile: string;

  before(() => {
    tmpFile = join(tmpdir(), `opencode-rag-test-${Date.now()}.json`);
  });

  after(() => {
    try {
      unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  });

  it("returns default config for empty file", () => {
    writeFileSync(tmpFile, "{}", "utf-8");
    const config = loadConfig(tmpFile);
    assert.deepStrictEqual(config, { ...DEFAULT_CONFIG, chunkers: undefined });
  });

  it("allows partial override of embedding proxy setting", () => {
    writeFileSync(
      tmpFile,
      JSON.stringify({ embedding: { useProxy: true } }),
      "utf-8"
    );
    const config = loadConfig(tmpFile);
    assert.equal(config.embedding.useProxy, true);
  });

  it("allows partial override of embedding settings", () => {
    writeFileSync(
      tmpFile,
      JSON.stringify({ embedding: { provider: "openai", model: "custom-model" } }),
      "utf-8"
    );
    const config = loadConfig(tmpFile);
    assert.equal(config.embedding.provider, "openai");
    assert.equal(config.embedding.model, "custom-model");
    assert.equal(config.embedding.baseUrl, DEFAULT_CONFIG.embedding.baseUrl);
  });

  it("allows partial override of indexing settings", () => {
    writeFileSync(
      tmpFile,
      JSON.stringify({ indexing: { chunkOverlap: 5 } }),
      "utf-8"
    );
    const config = loadConfig(tmpFile);
    assert.equal(config.indexing.chunkOverlap, 5);
    assert.deepStrictEqual(
      config.indexing.includeExtensions,
      DEFAULT_CONFIG.indexing.includeExtensions
    );
  });

  it("allows partial override of retrieval settings", () => {
    writeFileSync(
      tmpFile,
      JSON.stringify({ retrieval: { topK: 20 } }),
      "utf-8"
    );
    const config = loadConfig(tmpFile);
    assert.equal(config.retrieval.topK, 20);
  });

  it("allows partial override of openCode settings", () => {
    writeFileSync(
      tmpFile,
      JSON.stringify({ openCode: { maxContextChunks: 10 } }),
      "utf-8"
    );
    const config = loadConfig(tmpFile);
    assert.equal(config.openCode.maxContextChunks, 10);
    assert.equal(config.openCode.enabled, DEFAULT_CONFIG.openCode.enabled);
  });

  it("allows partial override of vectorStore path", () => {
    writeFileSync(
      tmpFile,
      JSON.stringify({ vectorStore: { path: "/custom/path" } }),
      "utf-8"
    );
    const config = loadConfig(tmpFile);
    assert.equal(config.vectorStore.path, "/custom/path");
  });
});

describe("DEFAULT_CONFIG", () => {
  it("has ollama as default embedding provider", () => {
    assert.equal(DEFAULT_CONFIG.embedding.provider, "ollama");
  });

  it("includes TypeScript extensions", () => {
    assert.ok(DEFAULT_CONFIG.indexing.includeExtensions.includes(".ts"));
    assert.ok(DEFAULT_CONFIG.indexing.includeExtensions.includes(".tsx"));
  });

  it("excludes node_modules, .git, and .opencode", () => {
    assert.ok(DEFAULT_CONFIG.indexing.excludeDirs.includes("node_modules"));
    assert.ok(DEFAULT_CONFIG.indexing.excludeDirs.includes(".git"));
    assert.ok(DEFAULT_CONFIG.indexing.excludeDirs.includes(".opencode"));
  });

  it("has openCode enabled by default", () => {
    assert.equal(DEFAULT_CONFIG.openCode.enabled, true);
  });

  it("has topK of 10", () => {
    assert.equal(DEFAULT_CONFIG.retrieval.topK, 10);
  });
});
