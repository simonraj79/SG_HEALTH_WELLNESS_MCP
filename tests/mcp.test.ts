import assert from "node:assert/strict";
import test from "node:test";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";

import { createHealthServer } from "../src/server.js";
import { ContractTestClient } from "./contract-client.js";

async function withClient(run: (client: Client, dataClient: ContractTestClient) => Promise<void>): Promise<void> {
  const dataClient = new ContractTestClient();
  const handler = createMcpHandler(() => createHealthServer(dataClient), { responseMode: "auto" });
  const transport = new StreamableHTTPClientTransport(new URL("http://contract.test/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: "contract-verifier", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);
  try {
    await run(client, dataClient);
  } finally {
    await client.close();
    await handler.close();
  }
}

test("advertises exactly the six public health tools", async () => {
  await withClient(async (client) => {
    const result = await client.listTools();
    assert.deepEqual(
      result.tools.map((tool) => tool.name).sort(),
      [
        "sg_health_find_locations",
        "sg_health_get_air_quality",
        "sg_health_get_source_metadata",
        "sg_health_get_uv_index",
        "sg_health_list_sources",
        "sg_health_query_table",
      ],
    );
    for (const tool of result.tools) {
      assert.equal(tool.annotations?.readOnlyHint, true);
      assert.equal(tool.annotations?.destructiveHint, false);
      assert.ok(tool.description);
    }
  });
});

test("returns structured source, metadata, query, and location results", async () => {
  await withClient(async (client) => {
    const sources = await client.callTool({ name: "sg_health_list_sources", arguments: {} });
    assert.equal((sources.structuredContent as { count: number }).count, 9);

    const metadata = await client.callTool({
      name: "sg_health_get_source_metadata",
      arguments: { source: "healthier_sg_drugs" },
    });
    assert.equal((metadata.structuredContent as { source: string }).source, "healthier_sg_drugs");

    const query = await client.callTool({
      name: "sg_health_query_table",
      arguments: { source: "polyclinic_attendance", query: "Chickenpox", limit: 5, offset: 0 },
    });
    assert.equal((query.structuredContent as { records: unknown[] }).records.length, 1);

    const locations = await client.callTool({
      name: "sg_health_find_locations",
      arguments: { source: "parks", latitude: 1.35, longitude: 103.82, limit: 5, offset: 0 },
    });
    const first = (locations.structuredContent as { locations: Array<{ name: string; distanceKm: number }> }).locations[0];
    assert.equal(first?.name, "Contract Wellness Location");
    assert.equal(typeof first?.distanceKm, "number");
  });
});

test("rejects unsupported full-text search with an actionable tool error", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({
      name: "sg_health_query_table",
      arguments: { source: "healthier_sg_drugs", query: "amlodipine", limit: 5, offset: 0 },
    });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /full_text_not_supported/);
  });
});

test("rejects malformed tool input at the MCP schema boundary", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({
      name: "sg_health_query_table",
      arguments: { source: "polyclinic_attendance", limit: 999, offset: -1 },
    });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /invalid|validation|too big|greater than/i);
  });
});

test("marks air quality as partial when one upstream feed fails", async () => {
  await withClient(async (client, dataClient) => {
    dataClient.pm25Fails = true;
    const result = await client.callTool({ name: "sg_health_get_air_quality", arguments: {} });
    const output = result.structuredContent as {
      partialData: boolean;
      unavailableSources: string[];
      overall: { psiCategory: string };
    };
    assert.equal(output.partialData, true);
    assert.deepEqual(output.unavailableSources, ["pm25"]);
    assert.equal(output.overall.psiCategory, "Moderate");
  });
});

test("selects the newest UV reading and official exposure category", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({ name: "sg_health_get_uv_index", arguments: {} });
    const output = result.structuredContent as { value: number; category: string; observedAt: string };
    assert.equal(output.value, 8);
    assert.equal(output.category, "Very High");
    assert.equal(output.observedAt, "2026-08-16T12:00:00+08:00");
  });
});
