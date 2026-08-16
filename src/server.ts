import { McpServer } from "@modelcontextprotocol/server";

import { SERVICE_NAME, SERVICE_VERSION, type DataGovClientContract } from "./contracts.js";
import { registerHealthTools } from "./tools.js";

export function createHealthServer(client: DataGovClientContract): McpServer {
  const server = new McpServer(
    { name: SERVICE_NAME, version: SERVICE_VERSION },
    {
      instructions:
        "Use these read-only tools for public Singapore health and wellness data from data.gov.sg. List sources before querying unfamiliar data. Preserve source dates and cautions. Never present historical statistics as current surveillance, a subsidy list as prescribing advice, or environmental guidance as personalised medical advice.",
      cacheHints: {
        "tools/list": { ttlMs: 3_600_000, cacheScope: "public" },
        "server/discover": { ttlMs: 3_600_000, cacheScope: "public" },
      },
    },
  );
  registerHealthTools(server, client);
  return server;
}
