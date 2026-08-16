# Singapore Health & Wellness MCP — Feature Matrix

Research completed: 2026-08-16 (Asia/Singapore)

This is the Phase 1 contract for the first public release. It was written before application code. The server exposes only public, non-personal data from data.gov.sg and performs no diagnosis, prescribing, or storage of health information.

## Public HTTP surface

| Route | Purpose | Auth model | Server rate limit | Response shape | Known failure modes |
|---|---|---|---|---|---|
| `GET /` | Human- and machine-readable service discovery | Anonymous | 60 requests/minute/IP | JSON: service name, version, MCP protocol, endpoint, health check, auth mode, tool names | `429` when the local limit is exceeded |
| `GET /healthz` | Render health check | Anonymous; exempt from application auth | Not rate limited | JSON: `{ status: "ok", service, version, protocolVersion, uptimeSeconds }` | `503` only when the process is not ready to serve |
| `POST /mcp` | Stateless Streamable HTTP MCP endpoint | Anonymous by default; if `MCP_API_KEY` is set, requires `Authorization: Bearer <key>` | 60 requests/minute/IP before upstream caching | MCP `2026-07-28` JSON-RPC response; JSON or request-scoped SSE according to the SDK | `400` invalid MCP request or header/body mismatch; `401` missing/invalid optional bearer token; `403` disallowed Host/Origin; `404` unknown MCP method; `429` local/upstream quota; `502` upstream unavailable |
| `GET`, `PUT`, `PATCH`, `DELETE /mcp` | Explicitly reject non-POST modern MCP traffic | Same as `/mcp` | 60 requests/minute/IP | JSON error with `Allow: POST` | `405 Method Not Allowed` by design |

The service binds to `0.0.0.0:$PORT` on Render. `ALLOWED_HOSTS` and `ALLOWED_ORIGINS` can restrict public Host/Origin values. Requests without an `Origin` header remain usable by normal MCP clients.

## MCP tool surface

| Tool | Upstream endpoint(s) | Auth model | Effective rate limit | Structured response | Known failure modes |
|---|---|---|---|---|---|
| `sg_health_list_sources` | None at call time; serves the curated contract below | MCP endpoint auth only | Local limit only | `{ sources: SourceSummary[], count, generatedAt }` | No upstream dependency; internal contract validation failure becomes an MCP tool error |
| `sg_health_get_source_metadata` | `GET /v2/public/api/datasets/{datasetId}/metadata` | Optional data.gov.sg `x-api-key` from `DATA_GOV_SG_API_KEY` | No numeric metadata quota published; cached 6 hours | `{ source, datasetId, name, description, agency, format, lastUpdatedAt, datasetSize, columns[] }` | `404` unknown/retired dataset; HTTP `200` with non-zero `code`; `429`; timeout/5xx; schema drift |
| `sg_health_query_table` | `GET https://data.gov.sg/api/action/datastore_search` | Optional data.gov.sg `x-api-key` | Per 10 seconds: 4 anonymous, 8 development key, 20 production key; successful pages cached 5 minutes | `{ source, datasetId, fields[], records[], total, count, limit, offset, hasMore, nextOffset? }` | `400` invalid fields/filters/sort or unsupported full-text query; `404` invalid dataset; `429`; empty result; timeout/5xx; a numeric source value may arrive as a JSON string |
| `sg_health_find_locations` | `GET /v1/public/api/datasets/{datasetId}/poll-download`, then the returned signed object URL | Optional data.gov.sg `x-api-key` on poll; signed download URL needs no additional auth | Dataset downloads per 10 seconds: 2 anonymous, 4 development key, 10 production key; normalized GeoJSON cached 30 minutes | `{ source, datasetId, totalMatched, count, offset, hasMore, nextOffset?, locations: [{ name, description?, address?, postalCode?, latitude, longitude, distanceKm?, sourceUrl }] }` | Poll returns `201`, not `200`; `404` invalid dataset; `429`; non-zero `code`; expired signed URL; object response is `application/octet-stream`; malformed/missing geometry; legacy attributes embedded in HTML `Description`; timeout/5xx |
| `sg_health_get_air_quality` | `GET /v2/real-time/api/psi` and `GET /v2/real-time/api/pm25` | Optional data.gov.sg `x-api-key` | Real-time APIs per 10 seconds: 6 anonymous, 12 development key, 30 production key; cached 5 minutes | `{ observedAt, updatedAt, overall: { psi24hMax, psiCategory }, regions: [{ region, psi24h, pm25OneHour, pm25TwentyFourHour }] , advisories, sources[] }` | One endpoint can fail while the other succeeds; `404` no reading for requested date; `429`; HTTP `200` with non-zero `code`; empty `items`; stale timestamps; timeout/5xx |
| `sg_health_get_uv_index` | `GET /v2/real-time/api/uv` | Optional data.gov.sg `x-api-key` | Real-time APIs per 10 seconds: 6 anonymous, 12 development key, 30 production key; cached 5 minutes | `{ observedAt, updatedAt, value, category, protectionGuidance, sourceUrl }` | `404` no reading; `429`; HTTP `200` with non-zero `code`; empty `records`/`index` outside reporting or during outage; stale timestamp; timeout/5xx |

All tools are read-only, idempotent, and open-world. Every successful tool returns both readable MCP `content` and matching `structuredContent`. Errors are returned as actionable MCP tool results with `isError: true`; internal stack traces and upstream credentials are never exposed.

## Curated data sources

Only these identifiers can be sent upstream. This prevents the public server from becoming an unrestricted proxy.

| Source key | Dataset ID | Format | Agency | Live metadata verified | Intended use |
|---|---|---|---|---|---|
| `healthier_sg_drugs` | `d_2a57d4e672be2a52118ae0bf4a0f4a4b` | CSV | Ministry of Health | 2026-08-16; upstream last updated 2026-05-25; 224 live rows | Search the Healthier SG whitelisted medicine list and subsidy classification; never medication advice |
| `nehr_institutions` | `d_2864c425e22ddb89969585820629adf8` | CSV | Ministry of Health | 2026-08-16; upstream last updated 2026-08-14; about 4,100 live rows | Check institutions participating in NEHR |
| `polyclinic_attendance` | `d_5d5508f1c954f5630d7b3aa7875d01f9` | CSV | Ministry of Health | 2026-08-16; upstream last updated 2024-06-06; 2,600+ live rows | Historical epidemiological-week attendance trends; not current outbreak detection |
| `diseases_conditions` | `d_01d45cd7b2113dc0c433bcd5218b67b8` | CSV | Ministry of Health | 2026-08-16; upstream last updated 2024-07-02; 42 live rows; full-text query returns `400` and is disabled | Enumerate dataset disease/condition labels using pagination or exact filters |
| `eldercare` | `d_f0fd1b3643ed8bd34bd403dedd7c1533` | GeoJSON | Ministry of Health | 2026-08-16; upstream last updated 2024-06-06 | Find eldercare locations |
| `parks` | `d_99b71f5d34cf57a3a592fbfdef1f42b6` | GeoJSON | Health Promotion Board | 2026-08-16; upstream last updated 2024-06-06; 52 live features | Find parks for light exercise |
| `gyms` | `d_b3ae090692ecf632116c9885cfbd3424` | GeoJSON | Health Promotion Board | 2026-08-16; upstream last updated 2024-06-06 | Find gyms and exercise facilities |
| `quit_centres` | `d_527eb9ff7e89d0499f1dcbf85d3f8c32` | GeoJSON | Health Promotion Board | 2026-08-16; upstream last updated 2026-08-02; 39 live features | Find smoking-cessation centres |
| `healthier_caterers` | `d_a93d46bbf91f3a9126a2e08a1982d5ad` | GeoJSON | Health Promotion Board | 2026-08-16; upstream last updated 2026-01-04; 126 live features | Find caterers participating in HPB's healthier-caterer listing |

## Upstream response contracts verified with live calls

| Endpoint | Observed success | Observed error | Shape notes |
|---|---|---|---|
| Dataset metadata | `200 application/json`, `{ code: 0, data: { datasetId, name, description, format, lastUpdatedAt, managedBy, datasetSize, columnMetadata }, errorMsg: "" }` | Invalid ID returned HTTP `404` | `columnMetadata` is present for tabular datasets and absent/empty for tested GeoJSON datasets; live sources represent `collectionIds` as either numbers or numeric strings |
| Datastore search | `200 application/json`, `{ success: true, result: { resource_id, fields, records, _links, total, limit, filters?/q? } }` | Invalid dataset returned `404 text/plain`; unsupported full-text search returned `400` with `{ success:false, error:{ __type:"Validation Error", query:[...] } }` | Fields can include internal `_id`, `_full_count`, and `rank`; numeric values such as `no._of_cases` were observed as strings |
| Poll download | `201 application/json`, `{ code: 0, data: { url: "signed HTTPS URL" }, errorMsg: "" }` | Invalid ID returned `404 application/json`, `{ error: "No table found for dataset ID: ..." }` | The signed object response was `200 application/octet-stream`; tested bodies were GeoJSON `FeatureCollection`s |
| GeoJSON object | Parks: 52 `Point` features with `Name` and HTML-table `Description`; Eldercare: 133 legacy `Point` features using longitude, latitude, altitude coordinates; Healthier Caterers: 126 `Point` features with structured uppercase attributes; Quit Centres: 39 structured `Point` features | Geometry/properties may be missing or malformed in future revisions | Normalization supports legacy HTML and structured properties, consumes longitude/latitude, and safely ignores an optional altitude coordinate |
| PSI | `200`, `{ code:0, data:{ regionMetadata, items:[{ timestamp, updatedTimestamp, readings:{ psi_twenty_four_hourly, pm25_twenty_four_hourly, ... } }] } }` | Documented `404`, `429`; non-zero `code` possible | Region maps use `north`, `south`, `east`, `west`, `central` keys |
| PM2.5 | `200`, `{ code:0, data:{ regionMetadata, items:[{ timestamp, updatedTimestamp, readings:{ pm25_one_hourly } }] } }` | Documented `404`, `429`; non-zero `code` possible | Unit is µg/m³; this one-hour reading must not be labelled as the 24-hour PSI |
| UV | `200`, `{ code:0, data:{ records:[{ timestamp, updatedTimestamp, index:[{ hour, value }] }] } }` | Documented `404`, `429`; records/index can be empty | Latest entry is selected by timestamp, not assumed array position |

## Fixed interpretation contracts

- PSI categories: `0–50 Good`, `51–100 Moderate`, `101–200 Unhealthy`, `201–300 Very Unhealthy`, and `>300 Hazardous`, following NEA.
- UV categories: `0–2 Low`, `3–5 Moderate`, `6–7 High`, `8–10 Very High`, and `>=11 Extreme`, following NEA.
- Environmental guidance is general public guidance, not individualized medical advice. Vulnerable people or anyone feeling unwell should follow current official advice and seek appropriate care.
- Historical dataset dates are always surfaced. The MCP must not describe historical attendance data as current surveillance.

## Source documentation

- data.gov.sg API overview: https://guide.data.gov.sg/developer-guide/api-overview
- data.gov.sg API rate limits: https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits
- data.gov.sg datastore search: https://guide.data.gov.sg/developer-guide/dataset-apis/search-and-filter-within-dataset
- data.gov.sg dataset download: https://guide.data.gov.sg/developer-guide/dataset-apis/download-dataset
- data.gov.sg metadata API: https://guide.data.gov.sg/developer-guide/dataset-apis/get-dataset-metadata
- data.gov.sg real-time APIs: https://guide.data.gov.sg/developer-guide/real-time-apis
- NEA PSI/haze guidance: https://www.nea.gov.sg/our-services/pollution-control/air-pollution/managing-haze
- NEA UV index categories: https://www.nea.gov.sg/corporate-functions/weather/ultraviolet-index
- MCP `2026-07-28` specification: https://modelcontextprotocol.io/specification/2026-07-28
- MCP TypeScript SDK v2: https://ts.sdk.modelcontextprotocol.io/v2/
