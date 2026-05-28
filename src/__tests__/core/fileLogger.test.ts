import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendDebugLog } from "../../core/fileLogger.js";

describe("appendDebugLog", () => {
  it("writes error entries to a file and appends subsequent entries", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "opencode-rag-log-test-"));

    try {
      const logFilePath = path.join(dir, ".opencode", "opencode-rag.log");

      appendDebugLog(logFilePath, {
        scope: "chat.message",
        message: "first failure",
        error: new Error("boom"),
      });

      appendDebugLog(logFilePath, {
        scope: "tool.execute.after",
        message: "second failure",
        error: "plain string error",
      });

      const content = readFileSync(logFilePath, "utf8");
      assert.match(content, /\[chat\.message\] first failure/);
      assert.match(content, /Error: boom/);
      assert.match(content, /\[tool\.execute\.after\] second failure/);
      assert.match(content, /plain string error/);
      assert.ok(content.includes("\n\n"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});