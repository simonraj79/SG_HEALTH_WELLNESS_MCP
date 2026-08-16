import assert from "node:assert/strict";
import test from "node:test";

import { DataGovClient } from "../src/data-gov-client.js";
import { AppError } from "../src/errors.js";

test("maps upstream 429 responses to a retryable public error", async () => {
  const client = new DataGovClient({
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: "rate limit" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "7" },
      }),
  });
  await assert.rejects(
    client.getUv(),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "upstream_rate_limited" &&
      error.retryable &&
      error.retryAfterSeconds === 7,
  );
});

test("rejects successful HTTP responses with schema drift", async () => {
  const client = new DataGovClient({
    fetchImpl: async () =>
      new Response(JSON.stringify({ code: 0, data: { unexpected: true }, errorMsg: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });
  await assert.rejects(
    client.getPsi(),
    (error: unknown) => error instanceof AppError && error.code === "upstream_schema_changed" && !error.retryable,
  );
});
