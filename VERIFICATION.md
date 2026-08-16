# Release Verification

Verified on 2026-08-16 in Singapore time.

## Runtime and dependency baseline

- Node.js `24.19.0`
- npm `11.17.0`
- MCP protocol `2026-07-28`
- Official MCP TypeScript packages `2.0.0`
- TypeScript `7.0.2`, Express `5.2.1`, Zod `4.4.3`
- Clean `npm ci`: passed
- Production dependency audit: zero known vulnerabilities

## Deterministic gate

`npm run build` completed with zero TypeScript errors. `npm test` passed 13 of 13 tests with no skipped or disabled tests.

Covered cases include upstream `429` mapping, schema drift, legacy and structured GeoJSON, invalid coordinates, discovery and health responses, optional bearer enforcement, method and Origin rejection, server rate limiting, exact tool advertisement, structured outputs, unsupported full-text search, malformed MCP input, partial air-quality failure, and newest UV-reading selection.

## Live gate

`npm run test:live` started the real Express/Streamable HTTP application on an ephemeral local port and passed:

- `GET /`, `GET /healthz`, and intentional `405` from `GET /mcp`;
- MCP initialization and `tools/list` with exactly six tools;
- source listing with exactly nine allowlisted sources;
- live metadata for all nine data.gov.sg datasets;
- live queries for all four tabular datasets;
- live poll/download/normalization for all five location datasets;
- live PSI plus PM2.5 aggregation across five regions;
- live UV Index selection and categorization.

Downloads were spaced to stay within the documented anonymous quota. The live pass also confirmed and incorporated two source variations: metadata collection identifiers can be numbers or numeric strings, and eldercare points can carry a third altitude coordinate.

## Repository and process gate

- Unfinished-marker and common-secret-pattern scans: no matches
- Environment example contains blank credential values only
- Render Blueprint and runtime use the same build, start, health, port, and environment contracts
- Fresh `npm start` process: passed
- Fresh `GET /healthz`: `status: ok`
- Fresh discovery response: version `1.0.0`, protocol `2026-07-28`, endpoint `/mcp`

## Operator action remaining

No external service was created during verification. Push the repository to a supported Git provider and connect it as a Render Blueprint. After Render deploys it, check the public `/healthz` and `/mcp` URLs from outside the Render network.
