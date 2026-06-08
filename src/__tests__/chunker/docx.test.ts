import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DocxChunker } from "../../chunker/docx.js";
import { getChunker } from "../../chunker/factory.js";

describe("DocxChunker", () => {
  const chunker = new DocxChunker();

  it("returns empty array for empty content", async () => {
    const chunks = await chunker.chunk("test.docx", "");
    assert.deepStrictEqual(chunks, []);
  });

  it("returns empty array for whitespace-only content", async () => {
    const chunks = await chunker.chunk("test.docx", "   \n  \n   ");
    assert.deepStrictEqual(chunks, []);
  });

  it("creates single chunk for single paragraph", async () => {
    const chunks = await chunker.chunk("test.docx", "Hello world. This is a single paragraph.");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.metadata.startLine, 1);
    assert.equal(chunks[0]!.metadata.endLine, 1);
    assert.equal(chunks[0]!.metadata.language, "docx");
    assert.equal(chunks[0]!.metadata.filePath, "test.docx");
  });

  it("splits content by double-newline paragraphs when above grouping threshold", async () => {
    const para = Array.from({ length: 40 }, (_, i) => `This is sentence ${i + 1} in a paragraph that should be long enough to avoid grouping.`).join(" ");
    const content = `${para}\n\n${para}\n\n${para}`;
    const chunks = await chunker.chunk("test.docx", content);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0]!.metadata.startLine, 1);
    assert.equal(chunks[1]!.metadata.startLine, 2);
    assert.equal(chunks[2]!.metadata.startLine, 3);
  });

  it("groups small consecutive paragraphs together", async () => {
    const content = "Small A.\n\nSmall B.\n\nSmall C.\n\nLarge paragraph with enough text to pass the grouping threshold. " +
      "This one should be on its own because it is large enough.\n\nSmall D.";
    const chunks = await chunker.chunk("test.docx", content);
    assert(chunks.length <= 4);
    assert(chunks[0]!.content.includes("Small A."));
    assert(chunks[0]!.content.includes("Small C."));
  });

  it("handles oversized paragraph as its own chunk", async () => {
    const oversized = "A".repeat(5000);
    const chunks = await chunker.chunk("test.docx", oversized);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.content, oversized);
  });

  it("splits multiple paragraphs when total exceeds MAX_CHUNK_CHARS", async () => {
    const para = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} in a paragraph that is just long enough.`).join(" ");
    const manyParas = Array.from({ length: 8 }, () => para).join("\n\n");
    const chunks = await chunker.chunk("test.docx", manyParas);
    assert(chunks.length > 1);
  });

  it("generates unique ids for each chunk", async () => {
    const content = "One.\n\nTwo.\n\nThree.";
    const chunks = await chunker.chunk("test.docx", content);
    const ids = new Set(chunks.map((c) => c.id));
    assert.equal(ids.size, chunks.length);
  });

  it("sets correct language property", () => {
    assert.equal(chunker.language, "docx");
  });

  it("has correct file extensions", () => {
    assert.deepStrictEqual(chunker.fileExtensions, [".docx"]);
  });
});

describe("DocxChunker — factory registration", () => {
  it("is registered in factory for .docx extension", () => {
    const chunker = getChunker("document.docx");
    assert.ok(chunker, "should return a chunker for .docx");
    assert.equal(chunker!.language, "docx");
  });
});
