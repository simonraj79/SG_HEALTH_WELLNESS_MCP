import { timingSafeEqual } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { pathToFileURL } from "node:url";

import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, type McpHttpHandler } from "@modelcontextprotocol/server";
import type { ErrorRequestHandler, Express, NextFunction, Request, RequestHandler, Response } from "express";

import { DataGovClient } from "./data-gov-client.js";
import { MCP_PROTOCOL_VERSION, SERVICE_NAME, SERVICE_VERSION, type DataGovClientContract } from "./contracts.js";
import { createHealthServer } from "./server.js";

const MCP_TOOL_NAMES = [
  "sg_health_list_sources",
  "sg_health_get_source_metadata",
  "sg_health_query_table",
  "sg_health_find_locations",
  "sg_health_get_air_quality",
  "sg_health_get_uv_index",
] as const;

interface HttpAppOptions {
  client?: DataGovClientContract;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

export interface HttpAppRuntime {
  app: Express;
  mcpHandler: McpHttpHandler;
  close(): Promise<void>;
}

interface RateWindow {
  count: number;
  resetsAt: number;
}

function commaList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value.length > 0).map((value) => value.toLowerCase()))];
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match?.[1]?.trim();
}

function tokensEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function apiKeyMiddleware(expected: string | undefined): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expected) {
      next();
      return;
    }
    const actual = bearerToken(req.headers.authorization);
    if (!actual || !tokensEqual(actual, expected)) {
      res
        .status(401)
        .set("WWW-Authenticate", 'Bearer realm="singapore-health-wellness-mcp"')
        .json({ jsonrpc: "2.0", error: { code: -32_001, message: "Unauthorized" }, id: null });
      return;
    }
    next();
  };
}

function rateLimitMiddleware(limit: number, now: () => number): RequestHandler {
  const windows = new Map<string, RateWindow>();
  const windowMs = 60_000;
  return (req: Request, res: Response, next: NextFunction): void => {
    const currentTime = now();
    const clientId = req.ip || req.socket.remoteAddress || "unknown";
    const existing = windows.get(clientId);
    const window = !existing || existing.resetsAt <= currentTime ? { count: 0, resetsAt: currentTime + windowMs } : existing;
    window.count += 1;
    windows.set(clientId, window);

    const remaining = Math.max(0, limit - window.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((window.resetsAt - currentTime) / 1_000));
    res.set({
      "RateLimit-Limit": String(limit),
      "RateLimit-Remaining": String(remaining),
      "RateLimit-Reset": String(Math.ceil(window.resetsAt / 1_000)),
    });
    if (window.count > limit) {
      res
        .status(429)
        .set("Retry-After", String(retryAfterSeconds))
        .json({
          error: "Too many requests",
          code: "server_rate_limited",
          retryable: true,
          retryAfterSeconds,
        });
      return;
    }

    if (windows.size > 10_000) {
      for (const [key, candidate] of windows) {
        if (candidate.resetsAt <= currentTime) windows.delete(key);
      }
    }
    next();
  };
}

export function createHttpApp(options: HttpAppOptions = {}): HttpAppRuntime {
  const env = options.env ?? process.env;
  const host = env.HOST ?? "0.0.0.0";
  const renderHostname = env.RENDER_EXTERNAL_HOSTNAME?.toLowerCase();
  const allowedHosts = unique(["localhost", "127.0.0.1", "[::1]", renderHostname, ...commaList(env.ALLOWED_HOSTS)]);
  const configuredOrigins = commaList(env.ALLOWED_ORIGINS);
  const allowedOrigins = unique(configuredOrigins.length > 0 ? configuredOrigins : allowedHosts);
  const rateLimit = parsePositiveInteger(env.HTTP_RATE_LIMIT_PER_MINUTE, 60);
  const client =
    options.client ??
    new DataGovClient({
      ...(env.DATA_GOV_SG_API_KEY ? { apiKey: env.DATA_GOV_SG_API_KEY } : {}),
      timeoutMs: parsePositiveInteger(env.UPSTREAM_TIMEOUT_MS, 10_000),
    });

  const mcpHandler = createMcpHandler(() => createHealthServer(client), { responseMode: "auto" });
  const nodeHandler = toNodeHandler(mcpHandler, {
    onerror: (error) => console.error("MCP adapter error", error),
  });
  const app = createMcpExpressApp({
    host,
    allowedHosts,
    allowedOrigins,
    jsonLimit: "128kb",
  });

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    });
    next();
  });

  app.get("/", (_req, res) => {
    res.status(200).set("Cache-Control", "public, max-age=300").json({
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      mcpProtocolVersion: MCP_PROTOCOL_VERSION,
      transport: "Streamable HTTP",
      endpoint: "/mcp",
      healthCheck: "/healthz",
      auth: env.MCP_API_KEY ? "bearer" : "anonymous",
      tools: MCP_TOOL_NAMES,
      dataSource: "https://data.gov.sg",
      repositoryReadyFor: "Render",
    });
  });

  app.get("/healthz", (_req, res) => {
    res.status(200).set("Cache-Control", "no-store").json({
      status: "ok",
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      protocolVersion: MCP_PROTOCOL_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.all(
    "/mcp",
    (_req, res, next) => {
      res.set("Cache-Control", "no-store");
      next();
    },
    rateLimitMiddleware(rateLimit, options.now ?? Date.now),
    apiKeyMiddleware(env.MCP_API_KEY),
    (req, res, next) => {
      if (req.method !== "POST") {
        res
          .status(405)
          .set("Allow", "POST")
          .json({ jsonrpc: "2.0", error: { code: -32_000, message: "Method not allowed; use POST." }, id: null });
        return;
      }
      void nodeHandler(req, res, req.body).catch(next);
    },
  );

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found", code: "not_found", retryable: false });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    console.error("HTTP request error", error);
    if (res.headersSent) return;
    const bodyParseError = error instanceof SyntaxError && "status" in error && error.status === 400;
    res.status(bodyParseError ? 400 : 500).json({
      error: bodyParseError ? "Request body is not valid JSON." : "Internal server error.",
      code: bodyParseError ? "invalid_json" : "internal_error",
      retryable: false,
    });
  };
  app.use(errorHandler);

  return {
    app,
    mcpHandler,
    close: async () => mcpHandler.close(),
  };
}

export async function startHttpServer(options: HttpAppOptions = {}): Promise<HttpServer> {
  const env = options.env ?? process.env;
  const host = env.HOST ?? "0.0.0.0";
  const port = parsePositiveInteger(env.PORT, 3_000);
  if (port > 65_535) throw new RangeError(`PORT must be between 1 and 65535; received ${port}.`);
  const runtime = createHttpApp(options);
  const server = await new Promise<HttpServer>((resolve, reject) => {
    const listening = runtime.app.listen(port, host, () => resolve(listening));
    listening.once("error", reject);
  });
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 125_000;
  console.log(`${SERVICE_NAME} ${SERVICE_VERSION} listening on http://${host}:${port}/mcp`);

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    console.log(`Received ${signal}; shutting down.`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await runtime.close();
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  server.once("close", () => void runtime.close());
  return server;
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entryPoint === import.meta.url) {
  startHttpServer().catch((error) => {
    console.error("Failed to start server", error);
    process.exitCode = 1;
  });
}
