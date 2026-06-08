import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DocChunker } from "../../chunker/doc.js";
import { getChunker } from "../../chunker/factory.js";

describe("DocChunker", () => {
  const chunker = new DocChunker();

  it("returns empty array for empty content", async () => {
    const chunks = await chunker.chunk("test.doc", "");
    assert.deepStrictEqual(chunks, []);
  });

  it("returns empty array for whitespace-only content", async () => {
    const chunks = await chunker.chunk("test.doc", "   \n  \n   ");
    assert.deepStrictEqual(chunks, []);
  });

  it("creates single chunk for single paragraph", async () => {
    const chunks = await chunker.chunk("test.doc", "Hello world. This is a single paragraph.");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.metadata.startLine, 1);
    assert.equal(chunks[0]!.metadata.endLine, 1);
    assert.equal(chunks[0]!.metadata.language, "doc");
    assert.equal(chunks[0]!.metadata.filePath, "test.doc");
  });

  it("splits content by double-newline paragraphs when above grouping threshold", async () => {
    const para = Array.from({ length: 40 }, (_, i) => `This is sentence ${i + 1} in a paragraph that should be long enough to avoid grouping.`).join(" ");
    const content = `${para}\n\n${para}\n\n${para}`;
    const chunks = await chunker.chunk("test.doc", content);
    assert.equal(chunks.length, 3);
  });

  it("groups small consecutive paragraphs together", async () => {
    const content = "Small A.\n\nSmall B.\n\nSmall C.\n\nLarge paragraph with enough text to pass the grouping threshold. " +
      "This one should be on its own because it is large enough.\n\nSmall D.";
    const chunks = await chunker.chunk("test.doc", content);
    assert(chunks.length <= 4);
    assert(chunks[0]!.content.includes("Small A."));
    assert(chunks[0]!.content.includes("Small C."));
  });

  it("handles oversized paragraph as its own chunk", async () => {
    const oversized = "A".repeat(5000);
    const chunks = await chunker.chunk("test.doc", oversized);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.content, oversized);
  });

  it("generates unique ids for each chunk", async () => {
    const content = "One.\n\nTwo.\n\nThree.";
    const chunks = await chunker.chunk("test.doc", content);
    const ids = new Set(chunks.map((c) => c.id));
    assert.equal(ids.size, chunks.length);
  });

  it("sets correct language property", () => {
    assert.equal(chunker.language, "doc");
  });

  it("has correct file extensions", () => {
    assert.deepStrictEqual(chunker.fileExtensions, [".doc"]);
  });
});

describe("DocChunker — factory registration", () => {
  it("is registered in factory for .doc extension", () => {
    const chunker = getChunker("document.doc");
    assert.ok(chunker, "should return a chunker for .doc");
    assert.equal(chunker!.language, "doc");
  });
});
