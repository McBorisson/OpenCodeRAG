import type { Chunker, Chunk } from "../core/interfaces.js";
import { uuid } from "./uuid.js";

const MAX_CHUNK_CHARS = 4000;

export async function extractExcelText(buffer: Buffer): Promise<string> {
  const XLSX = await import("@e965/xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    lines.push(`[Sheet: ${sheetName}]`);
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim().length > 0) {
      lines.push(csv);
    }
  }

  return lines.join("\n\n");
}

export class ExcelChunker implements Chunker {
  readonly language = "excel";
  readonly fileExtensions = [".xls", ".xlsx"];

  async chunk(filePath: string, content: string): Promise<Chunk[]> {
    if (content.trim().length === 0) return [];

    // Split by sheet sections (separated by double newlines)
    const sections = content.split(/\n\n(?=\[Sheet:)/).filter((s) => s.trim().length > 0);
    if (sections.length === 0) return [];

    const chunks: Chunk[] = [];
    let lineCounter = 0;

    for (const section of sections) {
      const sectionLines = section.split("\n");
      const startLine = lineCounter + 1;
      lineCounter += sectionLines.length;
      const endLine = lineCounter;

      if (section.length <= MAX_CHUNK_CHARS) {
        chunks.push({
          id: uuid(),
          content: section.trim(),
          metadata: { filePath, startLine, endLine, language: "excel" },
        });
        continue;
      }

      // Split oversized sheet content into row batches
      const rows = section.split("\n");
      let batch: string[] = [];
      let batchSize = 0;
      let batchStart = startLine;
      let rowLine = startLine;

      for (const row of rows) {
        rowLine++;
        const rowLen = row.length + 1;
        if (batch.length > 0 && batchSize + rowLen > MAX_CHUNK_CHARS) {
          chunks.push({
            id: uuid(),
            content: batch.join("\n").trim(),
            metadata: { filePath, startLine: batchStart, endLine: rowLine - 1, language: "excel" },
          });
          batch = [];
          batchSize = 0;
          batchStart = rowLine;
        }
        batch.push(row);
        batchSize += rowLen;
      }

      if (batch.length > 0) {
        chunks.push({
          id: uuid(),
          content: batch.join("\n").trim(),
          metadata: { filePath, startLine: batchStart, endLine: rowLine, language: "excel" },
        });
      }
    }

    return chunks;
  }
}

export const excelChunker = new ExcelChunker();
