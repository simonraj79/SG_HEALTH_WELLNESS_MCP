import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { DataGovClient } from "./data-gov-client.js";
import { createHealthServer } from "./server.js";

const dataClient = new DataGovClient({
  ...(process.env.DATA_GOV_SG_API_KEY ? { apiKey: process.env.DATA_GOV_SG_API_KEY } : {}),
  timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 10_000),
});

const handle = serveStdio(() => createHealthServer(dataClient), {
  onerror: (error) => console.error("Local MCP transport error", error),
});

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await handle.close();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
