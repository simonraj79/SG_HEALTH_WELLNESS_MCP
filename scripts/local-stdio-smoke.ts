import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

function assertStructured(result: Record<string, unknown>, label: string): void {
  assert.notEqual(result["isError"], true, `${label} returned a tool error`);
  assert.ok(result["structuredContent"] && typeof result["structuredContent"] === "object", `${label} has no structuredContent`);
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--env-file=.env", "dist/src/stdio.js"],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  let serverError = "";
  transport.stderr?.on("data", (chunk) => {
    serverError += String(chunk);
  });

  const client = new Client(
    { name: "local-codex-verifier", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 6);

    const sources = await client.callTool({ name: "sg_health_list_sources", arguments: {} });
    assertStructured(sources, "sg_health_list_sources");
    assert.equal((sources.structuredContent as { count: number }).count, 9);

    const metadata = await client.callTool({
      name: "sg_health_get_source_metadata",
      arguments: { source: "parks" },
    });
    assertStructured(metadata, "sg_health_get_source_metadata");

    const air = await client.callTool({ name: "sg_health_get_air_quality", arguments: {} });
    assertStructured(air, "sg_health_get_air_quality");
    assert.equal((air.structuredContent as { regions: unknown[] }).regions.length, 5);

    console.log("LOCAL STDIO MCP ok tools=6 sources=9 metadata=live air_regions=5");
  } catch (error) {
    if (serverError.trim()) console.error("Local MCP server reported an error.");
    throw error;
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Local STDIO verification failed", error);
  process.exitCode = 1;
});
