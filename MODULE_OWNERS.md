# Module Ownership

This build is executed serially by the primary Codex build agent, so no two agents edit the same module. The table fixes one accountable owner and one responsibility for every implementation area before module work begins.

| Module | Single owner | Responsibility |
|---|---|---|
| `src/contracts.ts` | Primary build agent (`/root`) | Shared types and public error/output contracts |
| `src/catalog.ts` | Primary build agent (`/root`) | Curated allowlist and source metadata |
| `src/data-gov-client.ts` | Primary build agent (`/root`) | HTTP, authentication, timeouts, response validation, caching |
| `src/geojson.ts` | Primary build agent (`/root`) | GeoJSON and legacy HTML-property normalization |
| `src/tools.ts` | Primary build agent (`/root`) | MCP schemas, tool registration, annotations, output formatting |
| `src/server.ts` | Primary build agent (`/root`) | Per-request MCP server factory |
| `src/http.ts` | Primary build agent (`/root`) | Public HTTP surface, security, auth, limits, lifecycle |
| `tests/` | Primary build agent (`/root`) | Contract, integration, adversarial, and live verification |
| `render.yaml` and operations docs | Primary build agent (`/root`) | Unmodified Render deployment and operator guidance |

Shared contracts are published in `src/contracts.ts` before the modules that consume them.
