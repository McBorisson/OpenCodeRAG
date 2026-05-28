import type { EmbeddingProvider } from "../core/interfaces.js";
import type { ProxyConfig } from "../core/config.js";
import path from "node:path";
import { directRequest, postJson, isLocalhost, type HttpResponseLike } from "./http.js";
import { appendDebugLog } from "../core/fileLogger.js";

export class OllamaProvider implements EmbeddingProvider {
  readonly name = "ollama";

  private baseUrl: string;
  private model: string;
  private apiKey?: string;
  private timeoutMs: number;
  private proxy?: ProxyConfig;

  constructor(baseUrl: string, model: string, apiKey?: string, timeoutMs: number = 30000, proxy?: ProxyConfig) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.proxy = proxy;
  }

  private getLogFilePath(): string {
    return path.resolve(process.cwd(), ".opencode", "opencode-rag.log");
  }

  private debug(message: string, error?: unknown): void {
    appendDebugLog(this.getLogFilePath(), {
      scope: "embedder.ollama",
      message,
      error,
    });
  }

  private shouldUseProxy(url: URL): boolean {
    if (!this.proxy?.url) return false;
    if (isLocalhost(url.hostname)) return false;
    return true;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    const payload = { model: this.model, input: texts.length === 1 ? texts[0] : texts };

    this.debug(
      `Starting embedding request: baseUrl=${this.baseUrl}, model=${this.model}, texts=${texts.length}, payloadType=${Array.isArray(payload.input) ? "batch" : "single"}`
    );

    const tryEmbedEndpoint = async (endpoint: string) => {
      const url = `${this.baseUrl}${endpoint}`;
      const parsedUrl = new URL(url);
      const useProxy = this.shouldUseProxy(parsedUrl);

      this.debug(
        `Sending Ollama embedding request to ${url} (proxy ${useProxy ? "enabled" : "disabled"})`
      );

      let response: HttpResponseLike;
      if (useProxy) {
        response = await postJson(url, payload, headers, this.timeoutMs, this.proxy);
      } else {
        response = await directRequest(new URL(url), payload, headers, this.timeoutMs);
      }

      this.debug(`Received Ollama response from ${url} with status ${response.status}`);

      if (!response.ok) {
        const body = await response.text();
        this.debug(`Ollama request failed for ${url}`, body.slice(0, 1000));
        return { ok: false as const, error: `Ollama embedding failed (${response.status}): ${body}` };
      }

      const body = await response.text();
      let json: { embedding?: number[]; embeddings?: number[][] };
      try {
        json = JSON.parse(body) as { embedding?: number[]; embeddings?: number[][] };
      } catch (error) {
        this.debug(`Failed to parse Ollama JSON response from ${url}`, error);
        this.debug(`Raw Ollama response body from ${url}`, body.slice(0, 1000));
        return { ok: false as const, error: `Ollama: invalid JSON response: ${body}` };
      }

      if (Array.isArray(json.embedding)) {
        this.debug(`Ollama response used embedding field from ${url}: vectorLength=${json.embedding.length}`);
        return { ok: true as const, embeddings: [json.embedding] };
      }

      if (Array.isArray(json.embeddings) && json.embeddings.every(Array.isArray)) {
        this.debug(
          `Ollama response used embeddings field from ${url}: batchSize=${json.embeddings.length}`
        );
        return { ok: true as const, embeddings: json.embeddings };
      }

      this.debug(`Ollama response shape was unexpected from ${url}`, json);
      return { ok: false as const, error: `Ollama: unexpected response: ${JSON.stringify(json)}` };
    };

    const primary = await tryEmbedEndpoint("/embed");
    if (primary.ok) {
      this.debug("Ollama primary endpoint /embed succeeded");
      return primary.embeddings;
    }

    this.debug("Ollama embedding failed on both endpoints", {
      primary: primary.error
    });
    throw new Error(primary.error);
  }
}
