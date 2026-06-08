import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExcelChunker } from "../../chunker/excel.js";
import { getChunker } from "../../chunker/factory.js";

describe("ExcelChunker", () => {
  const chunker = new ExcelChunker();

  it("returns empty array for empty content", async () => {
    const chunks = await chunker.chunk("test.xlsx", "");
    assert.deepStrictEqual(chunks, []);
  });

  it("returns empty array for whitespace-only content", async () => {
    const chunks = await chunker.chunk("test.xlsx", "   \n  \n   ");
    assert.deepStrictEqual(chunks, []);
  });

  it("creates one chunk per sheet for small sheets", async () => {
    const content = "[Sheet: Sheet1]\nA,B,C\n1,2,3\n\n[Sheet: Sheet2]\nX,Y\n10,20";
    const chunks = await chunker.chunk("test.xlsx", content);
    assert.equal(chunks.length, 2);
    assert.ok(chunks[0]!.content.includes("Sheet1"));
    assert.ok(chunks[1]!.content.includes("Sheet2"));
  });

  it("sets correct language", async () => {
    const content = "[Sheet: Sheet1]\nA,B\n1,2";
    const chunks = await chunker.chunk("test.xlsx", content);
    assert.equal(chunks[0]!.metadata.language, "excel");
  });

  it("sets correct file path", async () => {
    const content = "[Sheet: Sheet1]\nA,B\n1,2";
    const chunks = await chunker.chunk("test.xlsx", content);
    assert.equal(chunks[0]!.metadata.filePath, "test.xlsx");
  });

  it("splits oversized sheet into row batches", async () => {
    const rows = Array.from({ length: 200 }, (_, i) => `${i},value_${i},data_${i},more_${i},extra_${i}`).join("\n");
    const content = `[Sheet: BigSheet]\n${rows}`;
    const chunks = await chunker.chunk("test.xlsx", content);
    assert(chunks.length > 1, "should split oversized sheet into multiple chunks");
  });

  it("generates unique ids for each chunk", async () => {
    const content = "[Sheet: Sheet1]\nA,B\n1,2\n\n[Sheet: Sheet2]\nX,Y\n3,4";
    const chunks = await chunker.chunk("test.xlsx", content);
    const ids = new Set(chunks.map((c) => c.id));
    assert.equal(ids.size, chunks.length);
  });

  it("sets correct language property", () => {
    assert.equal(chunker.language, "excel");
  });

  it("has correct file extensions", () => {
    assert.deepStrictEqual(chunker.fileExtensions, [".xls", ".xlsx"]);
  });
});

describe("ExcelChunker — factory registration", () => {
  it("is registered in factory for .xlsx extension", () => {
    const chunker = getChunker("spreadsheet.xlsx");
    assert.ok(chunker, "should return a chunker for .xlsx");
    assert.equal(chunker!.language, "excel");
  });

  it("is registered in factory for .xls extension", () => {
    const chunker = getChunker("spreadsheet.xls");
    assert.ok(chunker, "should return a chunker for .xls");
    assert.equal(chunker!.language, "excel");
  });
});
