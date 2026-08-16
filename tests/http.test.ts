import assert from "node:assert/strict";
import type { Server } from "node:http";
import test from "node:test";

import type { Express } from "express";

import { createHttpApp, type HttpAppRuntime } from "../src/http.js";
import { ContractTestClient } from "./contract-client.js";

async function listen(app: Express): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not determine ephemeral port"));
        return;
      }
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
    server.once("error", reject);
  });
}

async function close(server: Server, runtime: HttpAppRuntime): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.close();
}

test("serves discovery and health endpoints", async () => {
  const runtime = createHttpApp({ client: new ContractTestClient(), env: { HOST: "127.0.0.1" } });
  const { server, origin } = await listen(runtime.app);
  try {
    const discovery = await fetch(`${origin}/`);
    assert.equal(discovery.status, 200);
    assert.equal((await discovery.json() as { mcpProtocolVersion: string }).mcpProtocolVersion, "2026-07-28");
    const health = await fetch(`${origin}/healthz`);
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { status: string }).status, "ok");
  } finally {
    await close(server, runtime);
  }
});

test("enforces optional bearer auth, POST-only MCP, and Origin validation", async () => {
  const runtime = createHttpApp({
    client: new ContractTestClient(),
    env: { HOST: "127.0.0.1", MCP_API_KEY: "contract-secret", HTTP_RATE_LIMIT_PER_MINUTE: "20" },
  });
  const { server, origin } = await listen(runtime.app);
  try {
    const unauthorized = await fetch(`${origin}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.headers.get("www-authenticate") ?? "", /Bearer/);

    const wrongMethod = await fetch(`${origin}/mcp`, {
      headers: { Authorization: "Bearer contract-secret" },
    });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "POST");

    const badOrigin = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: {
        Authorization: "Bearer contract-secret",
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: "{}",
    });
    assert.equal(badOrigin.status, 403);
  } finally {
    await close(server, runtime);
  }
});

test("returns 429 with Retry-After after the configured per-IP limit", async () => {
  let now = 1_000_000;
  const runtime = createHttpApp({
    client: new ContractTestClient(),
    env: { HOST: "127.0.0.1", HTTP_RATE_LIMIT_PER_MINUTE: "2" },
    now: () => now,
  });
  const { server, origin } = await listen(runtime.app);
  try {
    assert.equal((await fetch(`${origin}/mcp`)).status, 405);
    assert.equal((await fetch(`${origin}/mcp`)).status, 405);
    const limited = await fetch(`${origin}/mcp`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    now += 60_000;
    assert.equal((await fetch(`${origin}/mcp`)).status, 405);
  } finally {
    await close(server, runtime);
  }
});
