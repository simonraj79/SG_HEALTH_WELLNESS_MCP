# SG Health & Wellness MCP

**Useful Singapore public-health data, shaped for AI tools.**

SG Health & Wellness MCP is a public, read-only Model Context Protocol server for curated Ministry of Health and Health Promotion Board datasets published through data.gov.sg. It exposes live environmental readings, searchable health tables, and wellness-location directories through a safe allowlist instead of acting as a general-purpose data proxy.

The server targets the stable MCP `2026-07-28` specification and the official TypeScript SDK v2. It uses stateless Streamable HTTP, so one Render web service can serve multiple MCP clients.

> This is an information service, not a medical service. It does not diagnose, prescribe, store personal health data, or replace official guidance or professional care. Confirm directory details with the provider before visiting.

## What clients can do

| Tool | Purpose |
|---|---|
| `sg_health_list_sources` | Discover the nine curated sources and their cautions |
| `sg_health_get_source_metadata` | Read live publisher, size, update-time, format, and column metadata |
| `sg_health_query_table` | Page, filter, select, sort, and—where supported—search four tabular datasets |
| `sg_health_find_locations` | Find eldercare services, parks, gyms, quit centres, and healthier caterers, optionally sorted by distance |
| `sg_health_get_air_quality` | Read regional 24-hour PSI plus one-hour and 24-hour PM2.5 with partial-feed handling |
| `sg_health_get_uv_index` | Read the latest UV Index, official category, and general protection guidance |

The fixed source and response contract is documented in [FEATURE_MATRIX.md](./FEATURE_MATRIX.md). Every successful tool result includes both readable MCP content and validated `structuredContent`.

## Install the MCP in Codex

The quickest option is the public Streamable HTTP deployment in Singapore:

```text
https://singapore-health-wellness-mcp.onrender.com/mcp
```

No API key is currently required to connect to this public MCP endpoint.

### ChatGPT desktop app or Codex IDE extension

1. Open **Settings → MCP servers**.
2. Select **Add server**.
3. Name it `sg-health-wellness`, choose **Streamable HTTP**, and enter `https://singapore-health-wellness-mcp.onrender.com/mcp`.
4. Save, then restart the desktop app or IDE extension.
5. Enter `/mcp` in the composer to confirm the server is connected and exposes six tools.

### Codex CLI

```bash
codex mcp add sg-health-wellness --url https://singapore-health-wellness-mcp.onrender.com/mcp
codex mcp list
```

The ChatGPT desktop app, Codex CLI, and Codex IDE extension share MCP configuration on the same Codex host.

### Manual `config.toml` setup

Add this to `~/.codex/config.toml`, or to `.codex/config.toml` inside a trusted project:

```toml
[mcp_servers.sg_health_wellness]
url = "https://singapore-health-wellness-mcp.onrender.com/mcp"
enabled = true
default_tools_approval_mode = "auto"
```

Restart Codex after saving, then use `/mcp` to verify the connection.

### Install and run locally over STDIO

Use this option for development or when you do not want to depend on the hosted endpoint:

```bash
git clone https://github.com/simonraj79/SG_HEALTH_WELLNESS_MCP.git
cd SG_HEALTH_WELLNESS_MCP
npm ci
npm run build
```

Copy `.env.example` to `.env` and optionally add a `DATA_GOV_SG_API_KEY`. Then add a project-scoped `.codex/config.toml`, replacing `cwd` with the absolute path to your clone:

```toml
[mcp_servers.sg_health_wellness_local]
command = "node"
args = ["--env-file=.env", "dist/src/stdio.js"]
cwd = "C:/absolute/path/to/SG_HEALTH_WELLNESS_MCP"
enabled = true
```

Restart Codex and use `/mcp` to confirm `sg_health_wellness_local` is connected. You can validate the local server first with `npm run test:local-mcp`.

## Run locally

Requirements: Node.js 20 or newer. Render is configured to use Node.js 24.

```bash
npm ci
npm run build
npm test
npm start
```

The service starts at `http://localhost:3000` by default:

- MCP endpoint: `http://localhost:3000/mcp`
- Health check: `http://localhost:3000/healthz`
- Service discovery: `http://localhost:3000/`

For development with automatic reload:

```bash
npm run dev
```

### Test as a project-scoped Codex MCP

The local `.codex/config.toml` entry starts the server over STDIO only when this trusted project is open in Codex. It loads `DATA_GOV_SG_API_KEY` from the ignored `.env` file and does not require the HTTP server to remain running.

```bash
npm run build
npm run test:local-mcp
```

After the local smoke test passes, open this folder as the Codex project and restart the desktop app or extension. Use `/mcp` to confirm `sg_health_wellness_local` is connected. The machine-specific `.codex/config.toml` is intentionally excluded from Git.

Copy `.env.example` to `.env` for project-scoped STDIO testing; the local command loads it with Node's `--env-file` option. The HTTP service reads its environment directly, so set the same values in your shell or hosting platform when running HTTP or deploying.

## Deploy to Render

The repository includes a complete [render.yaml](./render.yaml); no source changes are needed.

1. Push this folder to a GitHub, GitLab, or Bitbucket repository.
2. In Render, choose **New → Blueprint** and connect the repository.
3. Review the `singapore-health-wellness-mcp` web service in the Singapore region.
4. Add `DATA_GOV_SG_API_KEY` in Render if you have one. The service works anonymously, but an upstream key gives higher data.gov.sg quotas.
5. Leave `MCP_API_KEY` unset for a public endpoint, or set a strong secret to require `Authorization: Bearer <secret>` on `/mcp`.
6. Deploy the Blueprint and wait for `/healthz` to report `status: ok`.

The public deployment for this repository is:

```text
https://singapore-health-wellness-mcp.onrender.com/mcp
```

If you deploy a separate copy, its client URL will be `https://<your-render-service>.onrender.com/mcp`.

Render supplies `PORT` and `RENDER_EXTERNAL_HOSTNAME` automatically. The app binds to `0.0.0.0:$PORT` and automatically allows its Render hostname. If you add a custom domain, add its hostname—without a scheme or port—to `ALLOWED_HOSTS`. Browser-based MCP callers with an `Origin` header must also have their origin hostname in `ALLOWED_ORIGINS`.

The included Blueprint uses Render's lowest paid web-service tier, `starter`, in the Singapore region for predictable availability without free-tier idle spin-down.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` locally | HTTP port; supplied automatically by Render |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_GOV_SG_API_KEY` | unset | Optional upstream `x-api-key` |
| `MCP_API_KEY` | unset | Optional static bearer token for `/mcp` |
| `ALLOWED_HOSTS` | Render hostname plus localhost | Additional comma-separated hostnames |
| `ALLOWED_ORIGINS` | allowed hostnames | Comma-separated browser Origin hostnames |
| `HTTP_RATE_LIMIT_PER_MINUTE` | `60` | Per-IP MCP request ceiling |
| `UPSTREAM_TIMEOUT_MS` | `10000` | data.gov.sg request timeout |

The optional static bearer token is appropriate for a small shared deployment. If the service later needs per-user identities, scopes, or delegated access, replace it with the MCP authorization flow rather than issuing many shared tokens.

## Verification

Run the deterministic contract and adversarial tests:

```bash
npm run build
npm test
```

Run the complete release gate, including live data.gov.sg calls through a real local HTTP server:

```bash
npm run verify
```

The live pass calls all six tools, all nine dataset metadata endpoints, all four table sources, all five location downloads, PSI, PM2.5, and UV. It deliberately spaces downloads to respect the documented anonymous quota. Do not run it repeatedly in a tight loop.

## Operational safeguards

- Dataset IDs are allowlisted; callers cannot turn the server into an unrestricted upstream proxy.
- Inputs and upstream responses are schema-validated.
- Successful upstream responses are cached, with request coalescing to reduce quota pressure.
- Requests have body-size, timeout, Host, Origin, rate, and optional bearer controls.
- One failed air-quality feed produces explicitly marked partial data; two failed feeds produce an actionable error.
- Errors omit credentials, stack traces, and signed download URLs.
- All MCP tools advertise read-only, non-destructive, and idempotent annotations.

See [VERIFICATION.md](./VERIFICATION.md) for the recorded release evidence, [SECURITY.md](./SECURITY.md) for responsible reporting, and [docs/REFINED_BUILD_PROMPT.md](./docs/REFINED_BUILD_PROMPT.md) for the reusable prompt structure used for this build.

## License

MIT. See [LICENSE](./LICENSE).
