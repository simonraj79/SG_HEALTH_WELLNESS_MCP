import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import { DataGovClient } from "../src/data-gov-client.js";
import { LOCATION_SOURCE_KEYS, TABULAR_SOURCE_KEYS, type SourceKey } from "../src/contracts.js";
import { createHttpApp } from "../src/http.js";

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertStructured(result: Record<string, unknown>, label: string): void {
  assert.notEqual(result["isError"], true, `${label} returned a tool error`);
  assert.ok(result["structuredContent"] && typeof result["structuredContent"] === "object", `${label} has no structuredContent`);
}

async function main(): Promise<void> {
  const dataClient = new DataGovClient({
    ...(process.env.DATA_GOV_SG_API_KEY ? { apiKey: process.env.DATA_GOV_SG_API_KEY } : {}),
    timeoutMs: 20_000,
  });
  const runtime = createHttpApp({
    client: dataClient,
    env: { HOST: "127.0.0.1", HTTP_RATE_LIMIT_PER_MINUTE: "200" },
  });
  const server = await new Promise<ReturnType<typeof runtime.app.listen>>((resolve, reject) => {
    const listening = runtime.app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const discoveryResponse = await fetch(`${baseUrl}/`);
  assert.equal(discoveryResponse.status, 200);
  assert.equal((await discoveryResponse.json() as { endpoint: string }).endpoint, "/mcp");
  console.log("LIVE GET / ok");

  const healthResponse = await fetch(`${baseUrl}/healthz`);
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json() as { status: string }).status, "ok");
  console.log("LIVE GET /healthz ok");

  const wrongMethodResponse = await fetch(`${baseUrl}/mcp`);
  assert.equal(wrongMethodResponse.status, 405);
  console.log("LIVE GET /mcp rejected with 405");

  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  const client = new Client(
    { name: "live-verifier", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);

  try {
    const listedTools = await client.listTools();
    assert.equal(listedTools.tools.length, 6);
    console.log("LIVE MCP tools/list ok count=6");

    const sources = await client.callTool({ name: "sg_health_list_sources", arguments: {} });
    assertStructured(sources, "sg_health_list_sources");
    assert.equal((sources.structuredContent as { count: number }).count, 9);
    console.log("LIVE sg_health_list_sources ok count=9");

    const allSources: SourceKey[] = [...TABULAR_SOURCE_KEYS, ...LOCATION_SOURCE_KEYS];
    for (const source of allSources) {
      const metadata = await client.callTool({ name: "sg_health_get_source_metadata", arguments: { source } });
      assertStructured(metadata, `sg_health_get_source_metadata:${source}`);
      console.log(`LIVE sg_health_get_source_metadata ok source=${source}`);
    }

    for (const source of TABULAR_SOURCE_KEYS) {
      const argumentsBySource: Record<string, unknown> = { source, limit: 1, offset: 0 };
      if (source === "polyclinic_attendance") argumentsBySource.query = "Chickenpox";
      const table = await client.callTool({ name: "sg_health_query_table", arguments: argumentsBySource });
      assertStructured(table, `sg_health_query_table:${source}`);
      assert.ok((table.structuredContent as { count: number }).count >= 1);
      console.log(`LIVE sg_health_query_table ok source=${source}`);
    }

    for (const [index, source] of LOCATION_SOURCE_KEYS.entries()) {
      if (index > 0) await wait(5_200);
      const locations = await client.callTool({
        name: "sg_health_find_locations",
        arguments: { source, limit: 1, offset: 0 },
      });
      assertStructured(locations, `sg_health_find_locations:${source}`);
      assert.ok((locations.structuredContent as { count: number }).count >= 1);
      console.log(`LIVE sg_health_find_locations ok source=${source}`);
    }

    const air = await client.callTool({ name: "sg_health_get_air_quality", arguments: {} });
    assertStructured(air, "sg_health_get_air_quality");
    assert.equal((air.structuredContent as { regions: unknown[] }).regions.length, 5);
    console.log("LIVE sg_health_get_air_quality ok regions=5");

    const uv = await client.callTool({ name: "sg_health_get_uv_index", arguments: {} });
    assertStructured(uv, "sg_health_get_uv_index");
    assert.equal(typeof (uv.structuredContent as { value: unknown }).value, "number");
    console.log("LIVE sg_health_get_uv_index ok");
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await runtime.close();
  }
}

main().catch((error) => {
  console.error("Live verification failed", error);
  process.exitCode = 1;
});
