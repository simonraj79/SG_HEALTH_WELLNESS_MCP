# Refined Prompt: Production MCP Research, Build, and Cloud Release

Use this prompt when you want an agent to turn an API-backed idea into a deployable MCP server. Replace every bracketed value before running it. The structure separates product scope, evidence, implementation contracts, and release gates so “done” has a testable meaning.

## Copy-ready prompt

```text
Act as the accountable technical lead for [PROJECT NAME]. Build a production-ready, publicly deployable MCP server backed by [AUTHORITATIVE DATA/API]. The target host is [HOSTING PLATFORM], and the repository must deploy there without source edits.

Use the latest stable MCP specification and the latest stable official [LANGUAGE] SDK available on the day work begins. Verify both from primary documentation and record the exact protocol date and package versions. Do not assume a marketing label such as “MCP 2.0” maps to a protocol version.

Product boundary
- Intended users: [USERS]
- Primary user jobs: [3–7 JOBS]
- Allowed data/actions: [ALLOWLIST]
- Explicit exclusions: [PERSONAL DATA, WRITE ACTIONS, DIAGNOSIS, ETC.]
- Public endpoint/auth model: [ANONYMOUS, OAUTH, OR OTHER]
- Deployment region and runtime constraints: [DETAILS]

Autonomy
- Proceed without asking about choices that have a safe, defensible default.
- Ask only for missing credentials, irreversible external actions, or product choices whose alternatives materially change the result.
- Do not deploy, publish, purchase, or create external resources unless I explicitly authorize it.
- Use named skills when requested and follow their instructions.

Phase 1 — Research and contract
Before writing application code, create exactly one FEATURE_MATRIX.md. For every proposed HTTP route, MCP tool, and upstream endpoint, record:
- user job and exact name;
- input, output, authentication, caching, and rate limits;
- success and error response shapes observed through live calls;
- freshness semantics and safety caveats;
- partial-failure behavior;
- source link and verification date.

Use primary sources. Exercise valid, empty, malformed, unauthorized, missing-resource, and rate-limit cases when safe. Resolve uncertain data shapes with live read-only calls. End Phase 1 with a one-paragraph checkpoint stating what is fixed and what remains uncertain. Do not begin implementation until the matrix exists.

Phase 2 — Contracts, ownership, and implementation
1. Publish shared types, schemas, error envelopes, and tool output contracts before consumer modules.
2. Record one accountable owner for each module. Parallel workers may only edit disjoint paths; do not use them when work is sequential or tightly coupled.
3. Build the smallest coherent public surface that covers the product jobs.
4. For every MCP tool:
   - use a clear verb-based name and task-oriented description;
   - validate inputs and outputs;
   - return readable content plus structuredContent;
   - declare accurate read-only/destructive/idempotent/open-world annotations;
   - return actionable, sanitized errors;
   - document pagination, freshness, and partial data.
5. For the remote HTTP layer:
   - use the current MCP Streamable HTTP pattern;
   - create isolated server/transport state per request unless sessions are required;
   - bind to the host’s required interface and port;
   - add health and discovery routes;
   - validate Host and Origin, cap body size, apply timeouts and rate limits;
   - define the chosen auth model explicitly;
   - handle graceful shutdown.
6. Add the hosting manifest, environment example, README, license, security notes, and CI. The deploy command must use a clean lockfile install and a zero-warning/zero-error production build where practical.

End Phase 2 with a one-paragraph checkpoint naming the implemented contract and any deliberate scope exclusions.

Phase 3 — Release gates
Do not call the work complete until all of these pass:
- clean dependency install;
- strict build with zero errors;
- deterministic contract and integration tests;
- every public route and MCP tool exercised over the real HTTP transport;
- every allowlisted upstream source exercised against live data;
- adversarial cases for malformed input, unauthorized access, local and upstream rate limits, schema drift, timeouts, and partial upstream failure;
- dependency audit appropriate to the runtime;
- repository scan contains no unfinished-work markers, placeholders, disabled tests, fabricated production data, credentials, or secrets;
- hosting manifest and documented environment variables agree with runtime behavior;
- fresh-process startup and health check succeed.

If a gate fails, fix the cause and rerun the affected gate. Record a concise evidence summary with command, count, and outcome. Clearly distinguish deterministic tests from live verification.

Final handoff
- Lead with what is ready.
- List the exact MCP URL shape and deployment steps.
- Link the feature matrix, README, hosting manifest, tests, and refined prompt.
- State what was verified live, the final test count, and any remaining operator action.
- Do not claim deployment occurred unless the hosted endpoint was actually created and checked.
```

## Why this structure is stronger

- It turns “latest” into a dated verification step instead of a guess.
- It gives research a single required artifact and prevents code from silently defining the product.
- It separates product exclusions from implementation choices, which keeps a public server narrow and safer.
- It permits parallel work only when file ownership is genuinely disjoint.
- It defines release evidence, including live transport verification, rather than accepting compilation as completion.
- It prevents the final handoff from confusing “deployable” with “already deployed.”

For this repository, the filled values are: SG Health & Wellness MCP; public data.gov.sg health and wellness sources; Render web service in Singapore; anonymous read-only access with optional static bearer protection; no personal data, diagnosis, prescribing, or write actions.
