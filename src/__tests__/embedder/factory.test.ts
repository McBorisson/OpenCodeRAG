import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEmbedder } from "../../embedder/factory.js";
import type { RagConfig } from "../../core/config.js";
import { DEFAULT_CONFIG } from "../../core/config.js";

function makeConfig(overrides: Partial<RagConfig>): RagConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    embedding: {
      ...DEFAULT_CONFIG.embedding,
      ...overrides.embedding,
    },
  };
}

describe("createEmbedder", () => {
  it("creates Ollama provider with default config", () => {
    const embedder = createEmbedder(DEFAULT_CONFIG);
    assert.equal(embedder.name, "ollama");
  });

  it("creates Ollama provider explicitly", () => {
    const config = makeConfig({
      embedding: {
        provider: "ollama",
        baseUrl: "http://localhost:11434/v1",
        model: "custom-model",
        apiKey: undefined,
        useProxy: false,
      },
    });
    const embedder = createEmbedder(config);
    assert.equal(embedder.name, "ollama");
  });

  it("creates Ollama provider with proxy enabled", () => {
    const config = makeConfig({
      embedding: {
        provider: "ollama",
        baseUrl: "http://localhost:11434/v1",
        model: "custom-model",
        apiKey: undefined,
        useProxy: true,
      },
    });
    const embedder = createEmbedder(config);
    assert.equal(embedder.name, "ollama");
  });

  it("creates OpenAI provider with apiKey", () => {
    const config = makeConfig({
      embedding: {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "text-embedding-3-small",
        apiKey: "sk-test-key",
      },
    });
    const embedder = createEmbedder(config);
    assert.equal(embedder.name, "openai");
  });

  it("throws for OpenAI provider without apiKey", () => {
    const config = makeConfig({
      embedding: {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "text-embedding-3-small",
        apiKey: undefined,
      },
    });
    assert.throws(() => createEmbedder(config), {
      message: "OpenAI provider requires an apiKey",
    });
  });

  it("throws for unknown provider", () => {
    const config = makeConfig({
      embedding: {
        provider: "unknown" as "ollama",
        baseUrl: "",
        model: "",
        apiKey: undefined,
      },
    });
    assert.throws(() => createEmbedder(config), {
      message: /Unknown embedding provider/,
    });
  });
});
