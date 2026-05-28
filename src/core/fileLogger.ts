import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export interface DebugLogEntry {
  scope: string;
  message: string;
  error?: unknown;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function appendDebugLog(logFilePath: string, entry: DebugLogEntry): void {
  try {
    mkdirSync(path.dirname(logFilePath), { recursive: true });

    const lines = [
      `[${new Date().toISOString()}] [${entry.scope}] ${entry.message}`,
    ];

    if (typeof entry.error !== "undefined") {
      lines.push(formatError(entry.error));
    }

    appendFileSync(logFilePath, `${lines.join("\n")}\n\n`, "utf8");
  } catch {
    // Logging must never break the plugin.
  }
}