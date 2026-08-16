import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";

import { getLocationSource, getSource, getTabularSource, listSourceSummaries } from "./catalog.js";
import {
  LOCATION_SOURCE_KEYS,
  TABULAR_SOURCE_KEYS,
  type AirQualityOutput,
  type DataGovClientContract,
  type LocationOutput,
  type MetadataOutput,
  type PsiCategory,
  type QueryOutput,
  type SingaporeRegion,
  type SourceKey,
  type UvCategory,
  type UvOutput,
} from "./contracts.js";
import { AppError, toToolErrorText } from "./errors.js";
import { normalizeLocations } from "./geojson.js";

const ALL_SOURCE_KEYS = [...TABULAR_SOURCE_KEYS, ...LOCATION_SOURCE_KEYS] as const;
const REGIONS: SingaporeRegion[] = ["north", "south", "east", "west", "central"];

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const sourceSummarySchema = z
  .object({
    key: z.enum(ALL_SOURCE_KEYS),
    datasetId: z.string(),
    name: z.string(),
    description: z.string(),
    agency: z.string(),
    format: z.string(),
    kind: z.enum(["tabular", "location"]),
    sourceUrl: z.url(),
    supportsFullText: z.boolean().optional(),
    caution: z.string().optional(),
  })
  .strict();

const metadataOutputSchema = z
  .object({
    source: z.enum(ALL_SOURCE_KEYS),
    datasetId: z.string(),
    name: z.string(),
    description: z.string(),
    agency: z.string(),
    format: z.string(),
    lastUpdatedAt: z.string(),
    datasetSize: z.number(),
    columns: z.array(
      z
        .object({
          name: z.string(),
          title: z.string(),
          dataType: z.string(),
          categorical: z.boolean(),
        })
        .strict(),
    ),
    sourceUrl: z.url(),
  })
  .strict();

const queryOutputSchema = z
  .object({
    source: z.enum(TABULAR_SOURCE_KEYS),
    datasetId: z.string(),
    fields: z.array(z.object({ id: z.string(), type: z.string() }).strict()),
    records: z.array(z.record(z.string(), z.unknown())),
    total: z.number(),
    count: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
    nextOffset: z.number().optional(),
    sourceUrl: z.url(),
    caution: z.string().optional(),
  })
  .strict();

const locationSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    address: z.string().optional(),
    postalCode: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
    distanceKm: z.number().optional(),
    sourceUrl: z.url(),
  })
  .strict();

const locationOutputSchema = z
  .object({
    source: z.enum(LOCATION_SOURCE_KEYS),
    datasetId: z.string(),
    totalMatched: z.number(),
    count: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
    nextOffset: z.number().optional(),
    locations: z.array(locationSchema),
    sourceUrl: z.url(),
  })
  .strict();

const airQualityOutputSchema = z
  .object({
    observedAt: z.string(),
    updatedAt: z.string(),
    overall: z
      .object({
        psi24hMax: z.number().optional(),
        psiCategory: z.enum(["Good", "Moderate", "Unhealthy", "Very Unhealthy", "Hazardous"]).optional(),
      })
      .strict(),
    regions: z.array(
      z
        .object({
          region: z.enum(["north", "south", "east", "west", "central"]),
          psi24h: z.number().optional(),
          pm25OneHour: z.number().optional(),
          pm25TwentyFourHour: z.number().optional(),
        })
        .strict(),
    ),
    advisories: z.array(z.string()),
    partialData: z.boolean(),
    unavailableSources: z.array(z.string()),
    sources: z.array(z.url()),
  })
  .strict();

const uvOutputSchema = z
  .object({
    observedAt: z.string(),
    updatedAt: z.string(),
    value: z.number(),
    category: z.enum(["Low", "Moderate", "High", "Very High", "Extreme"]),
    protectionGuidance: z.array(z.string()),
    sourceUrl: z.url(),
  })
  .strict();

function successResult<T extends Record<string, unknown>>(output: T, markdown: string) {
  return {
    content: [{ type: "text" as const, text: markdown }],
    structuredContent: output,
  };
}

function errorResult(error: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: toToolErrorText(error) }],
  };
}

function optionalNumber(value: number | undefined, key: string): Record<string, number> {
  return value === undefined ? {} : { [key]: value };
}

function psiCategory(value: number): PsiCategory {
  if (value <= 50) return "Good";
  if (value <= 100) return "Moderate";
  if (value <= 200) return "Unhealthy";
  if (value <= 300) return "Very Unhealthy";
  return "Hazardous";
}

function airAdvisories(category: PsiCategory | undefined): string[] {
  if (!category) return ["The 24-hour PSI feed is unavailable; consult NEA before planning outdoor activity."];
  if (category === "Good" || category === "Moderate") {
    return [
      "NEA's general guidance permits normal activities at Good or Moderate 24-hour PSI levels.",
      "People who feel unwell, especially those with chronic heart or lung conditions, should seek medical advice.",
    ];
  }
  if (category === "Unhealthy") {
    return [
      "Healthy people should reduce prolonged or strenuous outdoor physical exertion.",
      "Children, older adults, and pregnant people should minimise prolonged or strenuous outdoor exertion; people with chronic heart or lung disease should avoid it.",
    ];
  }
  if (category === "Very Unhealthy") {
    return [
      "Healthy people should avoid prolonged or strenuous outdoor physical exertion.",
      "Vulnerable groups should minimise or avoid outdoor activity according to current NEA guidance.",
    ];
  }
  return ["Minimise outdoor activity; vulnerable groups should avoid outdoor activity and follow current NEA guidance."];
}

function uvCategory(value: number): UvCategory {
  if (value <= 2) return "Low";
  if (value <= 5) return "Moderate";
  if (value <= 7) return "High";
  if (value <= 10) return "Very High";
  return "Extreme";
}

function uvGuidance(category: UvCategory): string[] {
  if (category === "Low") return ["Routine sun protection is generally sufficient."];
  const common = ["Use sunscreen of at least SPF 30.", "Seek shade or use an umbrella.", "Wear UVA/UVB-blocking sunglasses and a broad-brimmed hat."];
  if (category === "Moderate") return common;
  return [`UV exposure is ${category.toLowerCase()}; limit unnecessary exposure, especially between 11am and 3pm.`, ...common];
}

function newestBy<T>(values: T[], getTimestamp: (value: T) => string): T | undefined {
  return [...values].sort((left, right) => Date.parse(getTimestamp(right)) - Date.parse(getTimestamp(left)))[0];
}

export function registerHealthTools(server: McpServer, client: DataGovClientContract): void {
  server.registerTool(
    "sg_health_list_sources",
    {
      title: "List Singapore Health Data Sources",
      description:
        "List every curated data.gov.sg source available through this server, including its source key, agency, format, purpose, and caution. Use this before querying when you do not know the source key.",
      inputSchema: z
        .object({
          kind: z.enum(["tabular", "location"]).optional().describe("Optional source kind filter."),
          agency: z.enum(["Ministry of Health", "Health Promotion Board"]).optional().describe("Optional publishing-agency filter."),
        })
        .strict(),
      outputSchema: z.object({ sources: z.array(sourceSummarySchema), count: z.number(), generatedAt: z.string() }).strict(),
      annotations: { ...readOnlyAnnotations, openWorldHint: false },
    },
    async ({ kind, agency }) => {
      const sources = listSourceSummaries().filter(
        (source) => (kind === undefined || source.kind === kind) && (agency === undefined || source.agency === agency),
      );
      const output = { sources, count: sources.length, generatedAt: new Date().toISOString() };
      const markdown = [
        "# Singapore health and wellness data sources",
        "",
        ...sources.map((source) => `- **${source.key}** — ${source.name} (${source.agency}, ${source.format})${source.caution ? `\n  - Caution: ${source.caution}` : ""}`),
      ].join("\n");
      return successResult(output, markdown);
    },
  );

  server.registerTool(
    "sg_health_get_source_metadata",
    {
      title: "Get Singapore Health Source Metadata",
      description:
        "Get live data.gov.sg metadata for one curated source: update timestamp, size, format, publisher, description, and tabular columns. This does not return dataset rows.",
      inputSchema: z.object({ source: z.enum(ALL_SOURCE_KEYS).describe("Source key returned by sg_health_list_sources.") }).strict(),
      outputSchema: metadataOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ source }) => {
      try {
        const definition = getSource(source as SourceKey);
        const metadata = await client.getMetadata(definition.datasetId);
        const columns = Object.values(metadata.columnMetadata?.metaMapping ?? {})
          .sort((left, right) => Number(left.index) - Number(right.index))
          .map((column) => ({
            name: column.name,
            title: column.columnTitle,
            dataType: column.dataType,
            categorical: column.isCategorical,
          }));
        const output: MetadataOutput = {
          source: definition.key,
          datasetId: definition.datasetId,
          name: metadata.name,
          description: metadata.description,
          agency: metadata.managedBy,
          format: metadata.format,
          lastUpdatedAt: metadata.lastUpdatedAt,
          datasetSize: metadata.datasetSize,
          columns,
          sourceUrl: definition.sourceUrl,
        };
        const markdown = [
          `# ${output.name}`,
          "",
          `- **Source key:** ${output.source}`,
          `- **Agency:** ${output.agency}`,
          `- **Format:** ${output.format}`,
          `- **Last updated:** ${output.lastUpdatedAt}`,
          `- **Size:** ${output.datasetSize.toLocaleString("en-SG")} bytes`,
          ...(columns.length === 0 ? [] : ["", "## Columns", ...columns.map((column) => `- ${column.name} — ${column.title} (${column.dataType})`)]),
        ].join("\n");
        return successResult(output as unknown as Record<string, unknown>, markdown);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "sg_health_query_table",
    {
      title: "Query Singapore Health Table",
      description:
        "Query rows from one curated tabular health dataset. Supports pagination, exact field filters, field selection, sorting, and full-text query only where sg_health_list_sources reports supportsFullText=true. Historical results are returned with their source caution.",
      inputSchema: z
        .object({
          source: z.enum(TABULAR_SOURCE_KEYS).describe("Curated tabular source key."),
          limit: z.number().int().min(1).max(100).default(20).describe("Rows to return, 1 to 100."),
          offset: z.number().int().min(0).default(0).describe("Rows to skip for pagination."),
          fields: z.array(z.string().min(1).max(100)).max(20).optional().describe("Optional column names to return."),
          filters: z
            .record(z.string().min(1).max(100), z.union([z.string().max(500), z.number(), z.boolean()]))
            .optional()
            .describe("Optional exact-match column filters."),
          query: z.string().min(1).max(200).optional().describe("Full-text query; only supported by sources marked supportsFullText=true."),
          sort: z.string().min(1).max(200).optional().describe("data.gov.sg sort expression, for example 'epi_week desc'."),
        })
        .strict(),
      outputSchema: queryOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ source, limit, offset, fields, filters, query, sort }) => {
      try {
        const definition = getTabularSource(source);
        if (query && !definition.supportsFullText) {
          throw new AppError({
            message: `Source '${source}' does not support upstream full-text search. Use exact filters or omit query and page through rows.`,
            code: "full_text_not_supported",
            status: 400,
            retryable: false,
          });
        }
        const result = await client.queryDataset({
          datasetId: definition.datasetId,
          limit,
          offset,
          ...(fields === undefined ? {} : { fields }),
          ...(filters === undefined ? {} : { filters }),
          ...(query === undefined ? {} : { query }),
          ...(sort === undefined ? {} : { sort }),
        });
        const count = result.records.length;
        const hasMore = offset + count < result.total;
        const output: QueryOutput = {
          source,
          datasetId: definition.datasetId,
          fields: result.fields,
          records: result.records,
          total: result.total,
          count,
          limit,
          offset,
          hasMore,
          sourceUrl: definition.sourceUrl,
          ...(hasMore ? { nextOffset: offset + count } : {}),
          ...(definition.caution ? { caution: definition.caution } : {}),
        };
        const markdown = [
          `# ${definition.name}`,
          "",
          `Showing ${count} of ${result.total} matching rows (offset ${offset}).`,
          ...(definition.caution ? [``, `> ${definition.caution}`] : []),
          "",
          "```json",
          JSON.stringify(result.records, null, 2),
          "```",
        ].join("\n");
        return successResult(output as unknown as Record<string, unknown>, markdown);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "sg_health_find_locations",
    {
      title: "Find Singapore Health and Wellness Locations",
      description:
        "Find locations in one curated GeoJSON source: eldercare services, parks, gyms, quit centres, or healthier caterers. Optionally filter by text and sort by distance from a Singapore latitude/longitude. Results come from published directory data; confirm details with the provider before visiting.",
      inputSchema: z
        .object({
          source: z.enum(LOCATION_SOURCE_KEYS).describe("Curated location source key."),
          query: z.string().min(1).max(200).optional().describe("Case-insensitive text matched against name, description, address, and postal code."),
          latitude: z.number().min(1.1).max(1.6).optional().describe("Singapore latitude used with longitude for distance sorting."),
          longitude: z.number().min(103.4).max(104.2).optional().describe("Singapore longitude used with latitude for distance sorting."),
          limit: z.number().int().min(1).max(50).default(20).describe("Locations to return, 1 to 50."),
          offset: z.number().int().min(0).default(0).describe("Locations to skip for pagination."),
        })
        .strict()
        .refine((value) => (value.latitude === undefined) === (value.longitude === undefined), {
          message: "latitude and longitude must be supplied together",
          path: ["latitude"],
        }),
      outputSchema: locationOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ source, query, latitude, longitude, limit, offset }) => {
      try {
        const definition = getLocationSource(source);
        const collection = await client.downloadGeoJson(definition.datasetId);
        const origin = latitude === undefined || longitude === undefined ? undefined : { latitude, longitude };
        const matched = normalizeLocations(collection, definition, {
          ...(query === undefined ? {} : { query }),
          ...(origin === undefined ? {} : { origin }),
        });
        const locations = matched.slice(offset, offset + limit);
        const hasMore = offset + locations.length < matched.length;
        const output: LocationOutput = {
          source,
          datasetId: definition.datasetId,
          totalMatched: matched.length,
          count: locations.length,
          offset,
          hasMore,
          locations,
          sourceUrl: definition.sourceUrl,
          ...(hasMore ? { nextOffset: offset + locations.length } : {}),
        };
        const markdown = [
          `# ${definition.name}`,
          "",
          `Found ${matched.length} matching locations; showing ${locations.length}.`,
          "",
          ...locations.map((location) =>
            [
              `## ${location.name}`,
              ...(location.address ? [`- Address: ${location.address}`] : []),
              ...(location.postalCode ? [`- Postal code: ${location.postalCode}`] : []),
              `- Coordinates: ${location.latitude}, ${location.longitude}`,
              ...(location.distanceKm === undefined ? [] : [`- Distance: ${location.distanceKm} km`]),
            ].join("\n"),
          ),
        ].join("\n");
        return successResult(output as unknown as Record<string, unknown>, markdown);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "sg_health_get_air_quality",
    {
      title: "Get Singapore Air Quality",
      description:
        "Get current regional 24-hour PSI, one-hour PM2.5, 24-hour PM2.5, and NEA-aligned general activity guidance. The tool tolerates one upstream feed failing and explicitly marks partial data. It is not personalised medical advice.",
      inputSchema: z.object({}).strict(),
      outputSchema: airQualityOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async () => {
      try {
        const [psiResult, pm25Result] = await Promise.allSettled([client.getPsi(), client.getPm25()]);
        const unavailableSources: string[] = [];
        const psiItem = psiResult.status === "fulfilled" ? newestBy(psiResult.value.items, (item) => item.timestamp) : undefined;
        const pm25Item = pm25Result.status === "fulfilled" ? newestBy(pm25Result.value.items, (item) => item.timestamp) : undefined;
        if (!psiItem) unavailableSources.push("psi");
        if (!pm25Item) unavailableSources.push("pm25");
        if (!psiItem && !pm25Item) {
          throw new AppError({
            message: "Both current PSI and PM2.5 feeds are unavailable.",
            code: "air_quality_unavailable",
            status: 502,
            retryable: true,
          });
        }

        const psiValues = Object.values(psiItem?.readings.psi_twenty_four_hourly ?? {}).filter(
          (value): value is number => typeof value === "number",
        );
        const psi24hMax = psiValues.length > 0 ? Math.max(...psiValues) : undefined;
        const category = psi24hMax === undefined ? undefined : psiCategory(psi24hMax);
        const regions: AirQualityOutput["regions"] = REGIONS.map((region) => ({
          region,
          ...optionalNumber(psiItem?.readings.psi_twenty_four_hourly?.[region], "psi24h"),
          ...optionalNumber(pm25Item?.readings.pm25_one_hourly?.[region], "pm25OneHour"),
          ...optionalNumber(psiItem?.readings.pm25_twenty_four_hourly?.[region], "pm25TwentyFourHour"),
        }));
        const timestamps = [psiItem?.timestamp, pm25Item?.timestamp].filter((value): value is string => value !== undefined);
        const updatedTimestamps = [psiItem?.updatedTimestamp, pm25Item?.updatedTimestamp].filter(
          (value): value is string => value !== undefined,
        );
        const output: AirQualityOutput = {
          observedAt: newestBy(timestamps, (value) => value) ?? new Date().toISOString(),
          updatedAt: newestBy(updatedTimestamps, (value) => value) ?? new Date().toISOString(),
          overall: {
            ...(psi24hMax === undefined ? {} : { psi24hMax }),
            ...(category === undefined ? {} : { psiCategory: category }),
          },
          regions,
          advisories: airAdvisories(category),
          partialData: unavailableSources.length > 0,
          unavailableSources,
          sources: [
            ...(psiItem ? ["https://api-open.data.gov.sg/v2/real-time/api/psi"] : []),
            ...(pm25Item ? ["https://api-open.data.gov.sg/v2/real-time/api/pm25"] : []),
          ],
        };
        const markdown = [
          "# Singapore air quality",
          "",
          `Observed: ${output.observedAt}`,
          ...(category && psi24hMax !== undefined ? [`24-hour PSI maximum: **${psi24hMax} (${category})**`] : ["24-hour PSI: unavailable"]),
          ...(output.partialData ? [`Partial data: ${output.unavailableSources.join(", ")} unavailable.`] : []),
          "",
          "## Regions",
          ...regions.map(
            (region) =>
              `- **${region.region}** — PSI ${region.psi24h ?? "n/a"}; PM2.5 1h ${region.pm25OneHour ?? "n/a"} µg/m³; PM2.5 24h ${region.pm25TwentyFourHour ?? "n/a"} µg/m³`,
          ),
          "",
          ...output.advisories.map((advisory) => `- ${advisory}`),
        ].join("\n");
        return successResult(output as unknown as Record<string, unknown>, markdown);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "sg_health_get_uv_index",
    {
      title: "Get Singapore UV Index",
      description:
        "Get the latest Singapore UV Index reported by data.gov.sg/NEA, its official exposure category, and general sun-protection guidance. Measurements are from Changi and can vary elsewhere.",
      inputSchema: z.object({}).strict(),
      outputSchema: uvOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async () => {
      try {
        const data = await client.getUv();
        const readings = data.records.flatMap((record) => record.index.map((reading) => ({ ...reading, updatedAt: record.updatedTimestamp })));
        const latest = newestBy(readings, (reading) => reading.hour);
        if (!latest) {
          throw new AppError({
            message: "The UV feed contains no current readings. NEA normally reports UV readings between 7am and 7pm.",
            code: "uv_reading_unavailable",
            status: 404,
            retryable: true,
          });
        }
        const category = uvCategory(latest.value);
        const output: UvOutput = {
          observedAt: latest.hour,
          updatedAt: latest.updatedAt,
          value: latest.value,
          category,
          protectionGuidance: uvGuidance(category),
          sourceUrl: "https://api-open.data.gov.sg/v2/real-time/api/uv",
        };
        const markdown = [
          "# Singapore UV Index",
          "",
          `Latest reading: **${output.value} (${output.category})** at ${output.observedAt}`,
          "",
          ...output.protectionGuidance.map((guidance) => `- ${guidance}`),
          "",
          "Measurement is taken at Changi and may vary across Singapore.",
        ].join("\n");
        return successResult(output as unknown as Record<string, unknown>, markdown);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
