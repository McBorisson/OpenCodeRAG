import http from "node:http";
import https from "node:https";
import type { ProxyConfig } from "../core/config.js";

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export function isLocalhost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("127.")
  );
}

function parseNoProxyList(noProxy?: string): string[] {
  if (!noProxy) return [];
  return noProxy
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export function matchesNoProxy(hostname: string, noProxy?: string): boolean {
  const normalized = hostname.toLowerCase();
  const patterns = parseNoProxyList(noProxy);

  if (isLocalhost(normalized)) return true;

  for (const pattern of patterns) {
    if (pattern === "*") return true;
    if (pattern.startsWith(".") && normalized.endsWith(pattern)) return true;
    if (pattern.startsWith(".") && normalized === pattern.slice(1)) return true;
    if (normalized === pattern) return true;
  }

  return false;
}

function buildProxyAuthHeader(proxy?: ProxyConfig): string | undefined {
  if (proxy?.username && proxy?.password) {
    const encoded = Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64");
    return `Basic ${encoded}`;
  }
  return undefined;
}

function applyProxyEnv(proxy?: ProxyConfig): { httpProxy: string; httpsProxy: string } | null {
  if (!proxy?.url) return null;

  const existingHttp = process.env.HTTP_PROXY || process.env.http_proxy;
  const existingHttps = process.env.HTTPS_PROXY || process.env.https_proxy;

  if (existingHttp && existingHttps) return null;

  return {
    httpProxy: existingHttp || proxy.url,
    httpsProxy: existingHttps || proxy.url,
  };
}

export function directRequest(
  url: URL,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  redirectCount: number = 0
): Promise<HttpResponseLike> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const transport = url.protocol === "https:" ? https : http;

    const agent = new (url.protocol === "https:" ? https.Agent : http.Agent)();

    const request = transport.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        agent,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload).toString(),
          ...headers,
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;

        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          typeof location === "string" &&
          location.length > 0
        ) {
          if (redirectCount >= 5) {
            resolve({
              ok: false,
              status: statusCode,
              async text() {
                return `Redirect limit exceeded for ${url.toString()}`;
              },
              async json<T = unknown>() {
                return JSON.parse(`{"error":"Redirect limit exceeded"}`) as T;
              },
            });
            response.resume();
            return;
          }

          const nextUrl = new URL(location, url);
          response.resume();
          void directRequest(nextUrl, body, headers, timeoutMs, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

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
      request.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

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

export async function postJson(
  urlString: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  proxy?: ProxyConfig
): Promise<HttpResponseLike> {
  const url = new URL(urlString);

  const bypassProxy = isLocalhost(url.hostname) || matchesNoProxy(url.hostname, proxy?.noProxy);

  if (bypassProxy || !proxy?.url) {
    return directRequest(url, body, headers, timeoutMs);
  }

  return postJsonViaFetch(urlString, body, headers, timeoutMs, proxy);
}

async function postJsonViaFetch(
  urlString: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  proxy: ProxyConfig
): Promise<HttpResponseLike> {
  const authHeader = buildProxyAuthHeader(proxy);
  const envOverride = applyProxyEnv(proxy);

  const savedHttpProxy = process.env.HTTP_PROXY;
  const savedHttpsProxy = process.env.HTTPS_PROXY;

  try {
    if (envOverride) {
      process.env.HTTP_PROXY = envOverride.httpProxy;
      process.env.HTTPS_PROXY = envOverride.httpsProxy;
    }

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    if (authHeader) {
      requestHeaders["Proxy-Authorization"] = authHeader;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(urlString, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      return response as unknown as HttpResponseLike;
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    if (envOverride) {
      process.env.HTTP_PROXY = savedHttpProxy;
      process.env.HTTPS_PROXY = savedHttpsProxy;
    }
  }
}
