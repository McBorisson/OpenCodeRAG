import type { EmbeddingProvider } from "../core/interfaces.js";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { appendDebugLog } from "../core/fileLogger.js";

interface HttpResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export class OllamaProvider implements EmbeddingProvider {
  readonly name = "ollama";

  private baseUrl: string;
  private model: string;
  private apiKey?: string;
  private timeoutMs: number;
  private useProxy: boolean;

  constructor(baseUrl: string, model: string, apiKey?: string, timeoutMs: number = 5000, useProxy: boolean = false) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.useProxy = useProxy;
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

  private async postJsonWithProxy(urlString: string, body: unknown, headers: Record<string, string>): Promise<HttpResponseLike> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(urlString, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      return response as HttpResponseLike;
    } catch (err: any) {
      if (err && (err.name === "AbortError" || err.code === "ABORT_ERR")) {
        throw new Error(`Request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private postJsonNoProxy(urlString: string, body: unknown, headers: Record<string, string>): Promise<HttpResponseLike> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlString);
      const payload = JSON.stringify(body);
      const transport = url.protocol === "https:" ? https : http;
      const request = transport.request(
        {
          method: "POST",
          hostname: url.hostname,
          port: url.port ? Number(url.port) : undefined,
          path: `${url.pathname}${url.search}`,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload).toString(),
            ...headers,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf-8");
            resolve({
              ok: response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300,
              status: response.statusCode ?? 0,
              async text() {
                return text;
              },
              async json<T = unknown>() {
                return JSON.parse(text) as T;
              },
            });
          });
        }
      );

      const timeout = setTimeout(() => {
        request.destroy(new Error(`Request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      request.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      request.on("close", () => {
        clearTimeout(timeout);
      });

      request.end(payload);
    });
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
      this.debug(
        `Sending Ollama embedding request to ${url} (${this.useProxy ? "proxy enabled" : "proxy disabled"})`
      );

      const response = this.useProxy
        ? await this.postJsonWithProxy(url, payload, headers)
        : await this.postJsonNoProxy(url, payload, headers);
      this.debug(`Received Ollama response from ${url} with status ${response.status}`);

      if (!response.ok) {
        const body = await response.text();
        this.debug(`Ollama request failed for ${url}`, body.slice(0, 1000));
        return { ok: false as const, error: `Ollama embedding failed (${response.status}): ${body}` };
      }

      const body = await response.text();
      let json: { embedding?: number[] };
      try {
        json = JSON.parse(body) as { embedding?: number[] };
      } catch (error) {
        this.debug(`Failed to parse Ollama JSON response from ${url}`, error);
        this.debug(`Raw Ollama response body from ${url}`, body.slice(0, 1000));
        return { ok: false as const, error: `Ollama: invalid JSON response: ${body}` };
      }

      if (Array.isArray(json.embedding)) {
        this.debug(`Ollama response used embedding field from ${url}: vectorLength=${json.embedding.length}`);
        return { ok: true as const, embeddings: [json.embedding] };
      }

      this.debug(`Ollama response shape was unexpected from ${url}`, json);
      return { ok: false as const, error: `Ollama: unexpected response: ${JSON.stringify(json)}` };
    };

    const primary = await tryEmbedEndpoint("/embed");
    if (primary.ok) {
      this.debug("Ollama primary endpoint /embed succeeded");
      return primary.embeddings;
    }

    this.debug("Ollama embedding failed on /embed", primary.error);
    throw new Error(primary.error);
  }
}
