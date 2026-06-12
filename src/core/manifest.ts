import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface ManifestEntry {
  hash: string;
  chunkCount: number;
  indexedAt: number;
}

export const SCHEMA_VERSION = 1;

export interface FileManifest {
  lastIndexedAt?: number;
  schemaVersion?: number;
  files: Record<string, ManifestEntry>;
}

export type ManifestStatus = "ok" | "missing" | "corrupt";

export interface LoadedManifest {
  manifest: FileManifest;
  path: string;
  status: ManifestStatus;
}

export function createEmptyManifest(): FileManifest {
  return { files: {}, schemaVersion: SCHEMA_VERSION };
}

export function manifestPathFor(dbPath: string): string {
  return path.join(dbPath, "manifest.json");
}

export function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/");
}

export function computeFileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function loadManifest(dbPath: string): Promise<LoadedManifest> {
  const filePath = manifestPathFor(dbPath);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<FileManifest>;
    if (!parsed || typeof parsed !== "object" || !parsed.files || typeof parsed.files !== "object") {
      return { manifest: createEmptyManifest(), path: filePath, status: "corrupt" };
    }

    return {
      manifest: {
        lastIndexedAt: typeof parsed.lastIndexedAt === "number" ? parsed.lastIndexedAt : undefined,
        schemaVersion: parsed.schemaVersion,
        files: parsed.files as Record<string, ManifestEntry>,
      },
      path: filePath,
      status: parsed.schemaVersion === SCHEMA_VERSION ? "ok" : "corrupt",
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { manifest: createEmptyManifest(), path: filePath, status: "missing" };
    }
    return { manifest: createEmptyManifest(), path: filePath, status: "corrupt" };
  }
}

export async function saveManifest(dbPath: string, manifest: FileManifest): Promise<void> {
  const filePath = manifestPathFor(dbPath);
  const tempPath = `${filePath}.tmp`;

  manifest.schemaVersion = SCHEMA_VERSION;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2), "utf-8");
  await fs.rename(tempPath, filePath);
}
