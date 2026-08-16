import { z } from "zod/v4";

import { TtlCache } from "./cache.js";
import type {
  DataGovClientContract,
  DatasetMetadata,
  DatastoreResult,
  GeoJsonFeatureCollection,
  Pm25Data,
  PsiData,
  QueryDatasetRequest,
  UvData,
} from "./contracts.js";
import { AppError } from "./errors.js";

const METADATA_BASE_URL = "https://api-production.data.gov.sg/v2/public/api/datasets";
const DATASTORE_URL = "https://data.gov.sg/api/action/datastore_search";
const DOWNLOAD_BASE_URL = "https://api-open.data.gov.sg/v1/public/api/datasets";
const REALTIME_BASE_URL = "https://api-open.data.gov.sg/v2/real-time/api";

const METADATA_TTL_MS = 6 * 60 * 60 * 1_000;
const TABLE_TTL_MS = 5 * 60 * 1_000;
const GEOJSON_TTL_MS = 30 * 60 * 1_000;
const REALTIME_TTL_MS = 5 * 60 * 1_000;

const envelopeSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({ code: z.number(), data: dataSchema, errorMsg: z.string() }).loose();

const datasetMetadataSchema = z
  .object({
    datasetId: z.string(),
    createdAt: z.string(),
    name: z.string(),
    collectionIds: z.array(z.union([z.string(), z.number()])).default([]),
    description: z.string().default(""),
    format: z.string(),
    lastUpdatedAt: z.string(),
    managedBy: z.string(),
    contactEmails: z.array(z.string()).default([]),
    datasetSize: z.number(),
    columnMetadata: z
      .object({
        order: z.array(z.string()).optional(),
        map: z.record(z.string(), z.string()).optional(),
        metaMapping: z
          .record(
            z.string(),
            z
              .object({
                name: z.string(),
                columnTitle: z.string(),
                dataType: z.string(),
                index: z.string(),
                isCategorical: z.boolean(),
              })
              .loose(),
          )
          .optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

const datastoreSchema = z
  .object({
    success: z.literal(true),
    result: z
      .object({
        resource_id: z.string(),
        fields: z.array(z.object({ id: z.string(), type: z.string() }).loose()),
        records: z.array(z.record(z.string(), z.unknown())),
        total: z.number(),
        limit: z.number(),
        filters: z.string().optional(),
        q: z.string().optional(),
        _links: z
          .object({ start: z.string().optional(), next: z.string().optional() })
          .loose()
          .optional(),
      })
      .loose(),
  })
  .loose();

const geoJsonSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(
      z
        .object({
          type: z.literal("Feature"),
          geometry: z
            .object({
              type: z.literal("Point"),
              coordinates: z.tuple([z.number(), z.number()]).rest(z.number()),
            })
            .loose()
            .nullable(),
          properties: z.record(z.string(), z.unknown()).nullable(),
        })
        .loose(),
    ),
  })
  .loose();

const regionalReadingsSchema = z
  .object({
    north: z.number().optional(),
    south: z.number().optional(),
    east: z.number().optional(),
    west: z.number().optional(),
    central: z.number().optional(),
  })
  .loose();

const psiDataSchema = z
  .object({
    items: z.array(
      z
        .object({
          date: z.string(),
          timestamp: z.string(),
          updatedTimestamp: z.string(),
          readings: z
            .object({
              psi_twenty_four_hourly: regionalReadingsSchema.optional(),
              pm25_twenty_four_hourly: regionalReadingsSchema.optional(),
            })
            .loose(),
        })
        .loose(),
    ),
  })
  .loose();

const pm25DataSchema = z
  .object({
    items: z.array(
      z
        .object({
          date: z.string(),
          timestamp: z.string(),
          updatedTimestamp: z.string(),
          readings: z.object({ pm25_one_hourly: regionalReadingsSchema.optional() }).loose(),
        })
        .loose(),
    ),
  })
  .loose();

const uvDataSchema = z
  .object({
    records: z.array(
      z
        .object({
          date: z.string(),
          timestamp: z.string(),
          updatedTimestamp: z.string(),
          index: z.array(z.object({ hour: z.string(), value: z.number() }).loose()),
        })
        .loose(),
    ),
  })
  .loose();

interface DataGovClientOptions {
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  cache?: TtlCache;
}

export class DataGovClient implements DataGovClientContract {
  readonly #apiKey?: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #cache: TtlCache;

  constructor(options: DataGovClientOptions = {}) {
    if (options.apiKey !== undefined && options.apiKey.length > 0) {
      this.#apiKey = options.apiKey;
    }
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#cache = options.cache ?? new TtlCache();
  }

  async getMetadata(datasetId: string): Promise<DatasetMetadata> {
    return this.#cache.getOrLoad(`metadata:${datasetId}`, METADATA_TTL_MS, async () => {
      const raw = await this.#requestJson(`${METADATA_BASE_URL}/${encodeURIComponent(datasetId)}/metadata`);
      const envelope = this.#parseEnvelope(raw, datasetMetadataSchema, "dataset metadata");
      return envelope.data as DatasetMetadata;
    });
  }

  async queryDataset(request: QueryDatasetRequest): Promise<DatastoreResult> {
    const params = new URLSearchParams({
      resource_id: request.datasetId,
      limit: String(request.limit),
      offset: String(request.offset),
    });
    if (request.fields && request.fields.length > 0) params.set("fields", request.fields.join(","));
    if (request.filters && Object.keys(request.filters).length > 0) params.set("filters", JSON.stringify(request.filters));
    if (request.query) params.set("q", request.query);
    if (request.sort) params.set("sort", request.sort);

    const cacheKey = `table:${params.toString()}`;
    return this.#cache.getOrLoad(cacheKey, TABLE_TTL_MS, async () => {
      const raw = await this.#requestJson(`${DATASTORE_URL}?${params.toString()}`);
      const parsed = datastoreSchema.safeParse(raw);
      if (!parsed.success) {
        throw this.#schemaError("datastore response", parsed.error);
      }
      return parsed.data.result as DatastoreResult;
    });
  }

  async downloadGeoJson(datasetId: string): Promise<GeoJsonFeatureCollection> {
    return this.#cache.getOrLoad(`geojson:${datasetId}`, GEOJSON_TTL_MS, async () => {
      const ticketRaw = await this.#requestJson(`${DOWNLOAD_BASE_URL}/${encodeURIComponent(datasetId)}/poll-download`);
      const ticketEnvelope = this.#parseEnvelope(ticketRaw, z.object({ url: z.url() }).loose(), "download ticket");
      const geoRaw = await this.#requestJson(ticketEnvelope.data.url, false);
      const parsed = geoJsonSchema.safeParse(geoRaw);
      if (!parsed.success) {
        throw this.#schemaError("GeoJSON response", parsed.error);
      }
      return parsed.data as GeoJsonFeatureCollection;
    });
  }

  async getPsi(): Promise<PsiData> {
    return this.#getRealtime("psi", psiDataSchema) as Promise<PsiData>;
  }

  async getPm25(): Promise<Pm25Data> {
    return this.#getRealtime("pm25", pm25DataSchema) as Promise<Pm25Data>;
  }

  async getUv(): Promise<UvData> {
    return this.#getRealtime("uv", uvDataSchema) as Promise<UvData>;
  }

  async #getRealtime<T extends z.ZodType>(name: string, schema: T): Promise<z.infer<T>> {
    return this.#cache.getOrLoad(`realtime:${name}`, REALTIME_TTL_MS, async () => {
      const raw = await this.#requestJson(`${REALTIME_BASE_URL}/${name}`);
      return this.#parseEnvelope(raw, schema, `${name} response`).data;
    });
  }

  #parseEnvelope<T extends z.ZodType>(
    raw: unknown,
    schema: T,
    label: string,
  ): { code: number; data: z.output<T>; errorMsg: string } {
    const parsed = envelopeSchema(schema).safeParse(raw);
    if (!parsed.success) {
      throw this.#schemaError(label, parsed.error);
    }
    if (parsed.data.code !== 0) {
      throw new AppError({
        message: `data.gov.sg rejected the ${label}: ${parsed.data.errorMsg || `code ${parsed.data.code}`}`,
        code: "upstream_rejected",
        status: 502,
        retryable: false,
      });
    }
    return parsed.data as { code: number; data: z.output<T>; errorMsg: string };
  }

  async #requestJson(url: string, includeApiKey = true): Promise<unknown> {
    const headers = new Headers({ Accept: "application/json" });
    if (includeApiKey && this.#apiKey) headers.set("x-api-key", this.#apiKey);

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "TimeoutError";
      throw new AppError({
        message: timeout ? "data.gov.sg did not respond before the timeout." : "Could not reach data.gov.sg.",
        code: timeout ? "upstream_timeout" : "upstream_unreachable",
        status: 502,
        retryable: true,
        cause: error,
      });
    }

    if (!response.ok) {
      const retryAfterSeconds = this.#parseRetryAfter(response.headers.get("retry-after"));
      let message: string;
      if (response.status === 400) message = "data.gov.sg rejected the query. Check fields, filters, sort, and whether this dataset supports full-text search.";
      else if (response.status === 404) message = "The requested data.gov.sg dataset or reading was not found.";
      else if (response.status === 429) message = "The data.gov.sg request quota was exceeded.";
      else if (response.status >= 500) message = "data.gov.sg is temporarily unavailable.";
      else message = `data.gov.sg returned HTTP ${response.status}.`;

      throw new AppError({
        message,
        code:
          response.status === 400
            ? "upstream_bad_request"
            : response.status === 404
              ? "upstream_not_found"
              : response.status === 429
                ? "upstream_rate_limited"
                : "upstream_http_error",
        status: response.status === 429 ? 429 : 502,
        retryable: response.status === 429 || response.status >= 500,
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      });
    }

    try {
      return await response.json();
    } catch (error) {
      throw new AppError({
        message: "data.gov.sg returned a response that was not valid JSON.",
        code: "upstream_invalid_json",
        status: 502,
        retryable: true,
        cause: error,
      });
    }
  }

  #parseRetryAfter(value: string | null): number | undefined {
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
    const date = Date.parse(value);
    if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1_000));
    return undefined;
  }

  #schemaError(label: string, error: z.ZodError): AppError {
    const issue = error.issues[0];
    const location = issue?.path.join(".") || "response";
    return new AppError({
      message: `data.gov.sg changed the ${label} shape near '${location}'.`,
      code: "upstream_schema_changed",
      status: 502,
      retryable: false,
      cause: error,
    });
  }
}
