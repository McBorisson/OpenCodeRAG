import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TexChunker } from "../../chunker/tex.js";

describe("TexChunker", () => {
  const chunker = new TexChunker();

  it("returns empty array for empty content", async () => {
    const chunks = await chunker.chunk("test.tex", "");
    assert.deepStrictEqual(chunks, []);
  });

  it("returns single chunk for content without sections", async () => {
    const chunks = await chunker.chunk("test.tex", "\\documentclass{article}\n\\begin{document}\nHello world\n\\end{document}");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.metadata.startLine, 1);
    assert.equal(chunks[0]!.metadata.endLine, 4);
    assert.equal(chunks[0]!.content.includes("Hello world"), true);
  });

  it("splits on section commands", async () => {
    const content = [
      "\\section{Introduction}",
      "This is the introduction.",
      "",
      "\\section{Methods}",
      "These are the methods.",
    ].join("\n");

    const chunks = await chunker.chunk("test.tex", content);
    assert.equal(chunks.length, 2);
    assert.ok(chunks[0]!.content.includes("Introduction"));
    assert.ok(chunks[1]!.content.includes("Methods"));
  });

  it("splits on subsection and subsubsection", async () => {
    const content = [
      "\\section{Main}",
      "main content",
      "\\subsection{Sub}",
      "sub content",
      "\\subsubsection{Detail}",
      "detail content",
    ].join("\n");

    const chunks = await chunker.chunk("test.tex", content);
    assert.equal(chunks.length, 3);
  });

  it("splits on chapter commands", async () => {
    const content = [
      "\\chapter{First}",
      "first chapter",
      "\\chapter{Second}",
      "second chapter",
    ].join("\n");

    const chunks = await chunker.chunk("test.tex", content);
    assert.equal(chunks.length, 2);
    assert.ok(chunks[0]!.content.includes("First"));
    assert.ok(chunks[1]!.content.includes("Second"));
  });

  it("handles starred section commands", async () => {
    const content = [
      "\\section*{Intro}",
      "no number",
      "\\section{Real}",
      "numbered",
    ].join("\n");

    const chunks = await chunker.chunk("test.tex", content);
    assert.equal(chunks.length, 2);
  });

  it("sets latex language metadata", async () => {
    const chunks = await chunker.chunk("test.tex", "\\section{A}\ncontent");
    assert.equal(chunks[0]!.metadata.language, "latex");
  });

  it("sets correct filePath", async () => {
    const chunks = await chunker.chunk("/paper/main.tex", "\\section{A}\ncontent");
    assert.equal(chunks[0]!.metadata.filePath, "/paper/main.tex");
  });

  it("generates unique ids for each chunk", async () => {
    const content = [
      "\\section{First}",
      "first",
      "\\section{Second}",
      "second",
      "\\section{Third}",
      "third",
    ].join("\n");
    const chunks = await chunker.chunk("test.tex", content);
    assert.equal(chunks.length, 3);
    const ids = new Set(chunks.map((c) => c.id));
    assert.equal(ids.size, chunks.length);
  });

  it("skips content inside comment environment", async () => {
    const content = [
      "\\section{Real}",
      "real content",
      "\\begin{comment}",
      "hidden section",
      "\\section{Hidden}",
      "\\end{comment}",
      "\\section{After}",
      "after content",
    ].join("\n");

    const chunks = await chunker.chunk("test.tex", content);
    assert.equal(chunks.length, 2);
  });

  it("language property returns 'latex'", () => {
    assert.equal(chunker.language, "latex");
  });

  it("fileExtensions includes .tex", () => {
    assert.deepStrictEqual(chunker.fileExtensions, [".tex"]);
  });
});
