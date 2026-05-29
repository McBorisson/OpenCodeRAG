import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import type { ToolDefinition } from "@opencode-ai/plugin/tool";
import { createRagHooks, ragPlugin } from "../plugin.js";
import { DEFAULT_CONFIG, type RagConfig } from "../core/config.js";
import type { EmbeddingProvider, SearchResult, VectorStore } from "../core/interfaces.js";

function makeConfig(overrides: Partial<RagConfig> = {}): RagConfig {
  return {
    ...DEFAULT_CONFIG,
    embedding: {
      ...DEFAULT_CONFIG.embedding,
      ...overrides.embedding,
    },
    indexing: {
      ...DEFAULT_CONFIG.indexing,
      ...overrides.indexing,
    },
    vectorStore: {
      ...DEFAULT_CONFIG.vectorStore,
      ...overrides.vectorStore,
    },
    retrieval: {
      ...DEFAULT_CONFIG.retrieval,
      ...overrides.retrieval,
    },
    openCode: {
      ...DEFAULT_CONFIG.openCode,
      ...overrides.openCode,
    },
    chunkers: overrides.chunkers ?? DEFAULT_CONFIG.chunkers,
  };
}

function makeResult(
  id: string,
  filePath: string,
  startLine: number,
  endLine: number,
  language: string,
  content: string,
  score: number
): SearchResult {
  return {
    score,
    chunk: {
      id,
      content,
      metadata: {
        filePath,
        startLine,
        endLine,
        language,
      },
    },
  };
}

function makeToolContext() {
  return {
    sessionID: "session-1",
    messageID: "message-1",
    agent: "assistant",
    directory: "/workspace",
    worktree: "/workspace",
    abort: new AbortController().signal,
    metadata() {},
    ask: async () => {},
  };
}

function makeDependencies(results: SearchResult[], count = 1) {
  const store: VectorStore = {
    async addChunks(): Promise<void> {},
    async search(): Promise<SearchResult[]> {
      return results;
    },
    async count(): Promise<number> {
      return count;
    },
    async clear(): Promise<void> {},
    async deleteByFilePath(): Promise<void> {},
  };

  const embedder: EmbeddingProvider = {
    name: "mock",
    async embed(_texts: string[]): Promise<number[][]> {
      return [[0.1, 0.2, 0.3]];
    },
  };

  let seenQuery = "";
  let seenTopK = 0;

  return {
    dependencies: {
      createEmbedder: () => embedder,
      createStore: () => store,
      retrieve: async (
        query: string,
        _embedder: EmbeddingProvider,
        _store: VectorStore,
        options?: { topK?: number }
      ): Promise<SearchResult[]> => {
        seenQuery = query;
        seenTopK = options?.topK ?? 0;
        return results;
      },
    },
    getSeen: () => ({ query: seenQuery, topK: seenTopK }),
  };
}

describe("ragPlugin", () => {
  it("loads config per workspace directory", async () => {
    const disabledDir = mkdtempSync(path.join(tmpdir(), "opencode-rag-disabled-"));
    const enabledDir = mkdtempSync(path.join(tmpdir(), "opencode-rag-enabled-"));

    try {
      writeFileSync(
        path.join(disabledDir, "opencode-rag.json"),
        JSON.stringify({ openCode: { enabled: false } })
      );
      writeFileSync(
        path.join(enabledDir, "opencode-rag.json"),
        JSON.stringify({ openCode: { enabled: true } })
      );

      const disabledHooks = await ragPlugin({ directory: disabledDir } as PluginInput, {});
      assert.deepStrictEqual(disabledHooks, {});

      const enabledHooks = await ragPlugin({ directory: enabledDir } as PluginInput, {});
      assert.equal(typeof enabledHooks["chat.message"], "function");
      assert.ok(enabledHooks.tool?.["opencode-rag-context"]);
    } finally {
      rmSync(disabledDir, { recursive: true, force: true });
      rmSync(enabledDir, { recursive: true, force: true });
    }
  });

  it("exposes an explicit chunk retrieval tool", async () => {
    const results = [
      makeResult(
        "chunk-1",
        "src/plugin.ts",
        12,
        20,
        "typescript",
        "export function chunkEntryPoint() { return true; }",
        0.93
      ),
      makeResult(
        "chunk-2",
        "src/retriever/retriever.ts",
        1,
        30,
        "typescript",
        "export async function retrieve() { /* ... */ }",
        0.82
      ),
    ];

    const { dependencies, getSeen } = makeDependencies(results, 2);
    const hooks = createRagHooks({
      cfg: makeConfig({
        retrieval: { topK: 7 },
        openCode: { enabled: true, maxContextChunks: 5 },
      }),
      storePath: "memory://",
      logFilePath: path.join(tmpdir(), "opencode-rag.log"),
      dependencies,
    });

    const retrievalTool = hooks.tool?.["opencode-rag-context"] as ToolDefinition;
    assert.ok(retrievalTool, "expected chunk retrieval tool to be registered");

    const result = await retrievalTool.execute(
      {
        query: "Locate the chunking entry point",
        pathHints: ["src/plugin.ts"],
        languageHints: ["typescript"],
        topK: 4,
      },
      makeToolContext() as never
    );

    assert.notEqual(typeof result, "string");
    const structured = result as {
      title?: string;
      output: string;
      metadata?: Record<string, unknown>;
    };

    assert.equal(structured.title, "OpenCodeRAG context (2 chunks)");
    assert.match(structured.output, /opencode-rag retrieved context/);
    assert.match(structured.output, /src\/plugin\.ts:12-20/);
    assert.match(structured.output, /src\/retriever\/retriever\.ts:1-30/);
    assert.match(structured.output, /chunkEntryPoint/);
    assert.equal(structured.metadata?.chunks, 2);
    assert.deepStrictEqual(structured.metadata?.pathHints, ["src/plugin.ts"]);
    assert.deepStrictEqual(structured.metadata?.languageHints, ["typescript"]);

    const seen = getSeen();
    assert.match(seen.query, /Locate the chunking entry point/);
    assert.match(seen.query, /Path hints: src\/plugin\.ts/);
    assert.match(seen.query, /Language hints: typescript/);
    assert.equal(seen.topK, 4);
  });

  it("returns a helpful message when the index is empty", async () => {
    const { dependencies } = makeDependencies([], 0);
    const hooks = createRagHooks({
      cfg: makeConfig(),
      storePath: "memory://",
      logFilePath: path.join(tmpdir(), "opencode-rag.log"),
      dependencies: {
        ...dependencies,
        retrieve: async () => {
          assert.fail("retrieve should not run when the index is empty");
        },
      },
    });

    const retrievalTool = hooks.tool?.["opencode-rag-context"] as ToolDefinition;
    assert.ok(retrievalTool);

    const result = await retrievalTool!.execute(
      { query: "anything" },
      makeToolContext() as never
    );

    assert.notEqual(typeof result, "string");
    const structured = result as {
      title?: string;
      output: string;
      metadata?: Record<string, unknown>;
    };

    assert.equal(structured.title, "OpenCodeRAG context");
    assert.match(structured.output, /No indexed chunks are available yet/);
    assert.equal(structured.metadata?.indexed, false);
    assert.equal(structured.metadata?.chunks, 0);
  });

  it("adds system guidance for chunk retrieval", async () => {
    const { dependencies } = makeDependencies([], 1);
    const hooks = createRagHooks({
      cfg: makeConfig(),
      storePath: "memory://",
      logFilePath: path.join(tmpdir(), "opencode-rag.log"),
      dependencies,
    });

    const systemHook = hooks["experimental.chat.system.transform"];
    assert.ok(systemHook);

    const output = { system: [] as string[] };
    await systemHook?.({ model: { providerID: "test", modelID: "test" } } as never, output as never);

    assert.ok(output.system.length > 0);
    assert.match(output.system[0]!, /opencode-rag-context/);
    assert.match(output.system[0]!, /Use it before planning/);
  });

  it("appends retrieved chunk text to the chat message before tool use", async () => {
    const { dependencies } = makeDependencies(
      [
        makeResult(
          "chunk-1",
          "src/embedder/openai.ts",
          5,
          12,
          "typescript",
          "export class OpenAIProvider implements EmbeddingProvider {}",
          0.97
        ),
      ],
      1
    );
    const hooks = createRagHooks({
      cfg: makeConfig({
        openCode: { enabled: true, maxContextChunks: 5 },
      }),
      storePath: "memory://",
      logFilePath: path.join(tmpdir(), "opencode-rag.log"),
      dependencies,
    });

    const chatMessageHook = hooks["chat.message"];
    assert.ok(chatMessageHook);

    const output = {
      message: {
        id: "msg-1",
        role: "user",
        sessionID: "session-1",
      },
      parts: [{
        type: "text",
        text: "show me the OpenAI API files",
        id: "prt-1",
        messageID: "msg-1",
        sessionID: "session-1",
      }],
    };

    await chatMessageHook?.({ sessionID: "session-1" } as never, output as never);

    assert.equal(output.parts.length, 2);
    assert.match(output.parts[1]!.text ?? "", /opencode-rag retrieved context/);
    assert.match(output.parts[1]!.text ?? "", /src\/embedder\/openai\.ts:5-12/);
    assert.match(output.parts[1]!.text ?? "", /OpenAIProvider/);
    assert.equal(output.parts[1]!.messageID, "msg-1");
    assert.equal(output.parts[1]!.sessionID, "session-1");
    assert.match(output.parts[1]!.id ?? "", /^prt_/);
  });
});
