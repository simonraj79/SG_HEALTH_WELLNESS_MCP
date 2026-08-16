export const MCP_PROTOCOL_VERSION = "2026-07-28" as const;
export const SERVICE_NAME = "singapore-health-wellness-mcp-server" as const;
export const SERVICE_VERSION = "1.0.0" as const;

export const TABULAR_SOURCE_KEYS = [
  "healthier_sg_drugs",
  "nehr_institutions",
  "polyclinic_attendance",
  "diseases_conditions",
] as const;

export const LOCATION_SOURCE_KEYS = [
  "eldercare",
  "parks",
  "gyms",
  "quit_centres",
  "healthier_caterers",
] as const;

export type TabularSourceKey = (typeof TABULAR_SOURCE_KEYS)[number];
export type LocationSourceKey = (typeof LOCATION_SOURCE_KEYS)[number];
export type SourceKey = TabularSourceKey | LocationSourceKey;
export type SourceKind = "tabular" | "location";

export interface SourceDefinition {
  key: SourceKey;
  datasetId: `d_${string}`;
  name: string;
  description: string;
  agency: "Ministry of Health" | "Health Promotion Board";
  format: "CSV" | "GEOJSON";
  kind: SourceKind;
  sourceUrl: `https://data.gov.sg/datasets/${string}/view`;
  supportsFullText?: boolean;
  caution?: string;
}

export interface DataGovEnvelope<T> {
  code: number;
  data: T;
  errorMsg: string;
}

export interface DatasetColumnMetadata {
  name: string;
  columnTitle: string;
  dataType: string;
  index: string;
  isCategorical: boolean;
}

export interface DatasetMetadata {
  datasetId: string;
  createdAt: string;
  name: string;
  collectionIds: Array<string | number>;
  description: string;
  format: string;
  lastUpdatedAt: string;
  managedBy: string;
  contactEmails: string[];
  datasetSize: number;
  columnMetadata?: {
    order?: string[];
    map?: Record<string, string>;
    metaMapping?: Record<string, DatasetColumnMetadata>;
  };
}

export interface DatastoreField {
  id: string;
  type: string;
}

export type DataRecord = Record<string, unknown>;

export interface DatastoreResult {
  resource_id: string;
  fields: DatastoreField[];
  records: DataRecord[];
  total: number;
  limit: number;
  filters?: string;
  q?: string;
  _links?: {
    start?: string;
    next?: string;
  };
}

export interface DatastoreSuccess {
  success: true;
  result: DatastoreResult;
}

export interface DownloadTicket {
  url: string;
}

export interface GeoJsonPointGeometry {
  type: "Point";
  coordinates: [number, number, ...number[]];
}

export interface GeoJsonFeature {
  type: "Feature";
  geometry: GeoJsonPointGeometry | null;
  properties: Record<string, unknown> | null;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

export type SingaporeRegion = "north" | "south" | "east" | "west" | "central";
export type RegionalReadings = Partial<Record<SingaporeRegion, number>>;

export interface PsiReadings {
  psi_twenty_four_hourly?: RegionalReadings;
  pm25_twenty_four_hourly?: RegionalReadings;
}

export interface PsiItem {
  date: string;
  timestamp: string;
  updatedTimestamp: string;
  readings: PsiReadings;
}

export interface PsiData {
  items: PsiItem[];
}

export interface Pm25Item {
  date: string;
  timestamp: string;
  updatedTimestamp: string;
  readings: {
    pm25_one_hourly?: RegionalReadings;
  };
}

export interface Pm25Data {
  items: Pm25Item[];
}

export interface UvIndexReading {
  hour: string;
  value: number;
}

export interface UvRecord {
  date: string;
  timestamp: string;
  updatedTimestamp: string;
  index: UvIndexReading[];
}

export interface UvData {
  records: UvRecord[];
}

export interface QueryDatasetRequest {
  datasetId: string;
  limit: number;
  offset: number;
  fields?: string[];
  filters?: Record<string, string | number | boolean>;
  query?: string;
  sort?: string;
}

export interface NormalizedLocation {
  name: string;
  description?: string;
  address?: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
  distanceKm?: number;
  sourceUrl: string;
}

export interface SourceSummary {
  key: SourceKey;
  datasetId: string;
  name: string;
  description: string;
  agency: string;
  format: string;
  kind: SourceKind;
  sourceUrl: string;
  supportsFullText?: boolean;
  caution?: string;
}

export interface MetadataOutput {
  source: SourceKey;
  datasetId: string;
  name: string;
  description: string;
  agency: string;
  format: string;
  lastUpdatedAt: string;
  datasetSize: number;
  columns: Array<{
    name: string;
    title: string;
    dataType: string;
    categorical: boolean;
  }>;
  sourceUrl: string;
}

export interface QueryOutput {
  source: TabularSourceKey;
  datasetId: string;
  fields: DatastoreField[];
  records: DataRecord[];
  total: number;
  count: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset?: number;
  sourceUrl: string;
  caution?: string;
}

export interface LocationOutput {
  source: LocationSourceKey;
  datasetId: string;
  totalMatched: number;
  count: number;
  offset: number;
  hasMore: boolean;
  nextOffset?: number;
  locations: NormalizedLocation[];
  sourceUrl: string;
}

export type PsiCategory = "Good" | "Moderate" | "Unhealthy" | "Very Unhealthy" | "Hazardous";
export type UvCategory = "Low" | "Moderate" | "High" | "Very High" | "Extreme";

export interface AirQualityRegion {
  region: SingaporeRegion;
  psi24h?: number;
  pm25OneHour?: number;
  pm25TwentyFourHour?: number;
}

export interface AirQualityOutput {
  observedAt: string;
  updatedAt: string;
  overall: {
    psi24hMax?: number;
    psiCategory?: PsiCategory;
  };
  regions: AirQualityRegion[];
  advisories: string[];
  partialData: boolean;
  unavailableSources: string[];
  sources: string[];
}

export interface UvOutput {
  observedAt: string;
  updatedAt: string;
  value: number;
  category: UvCategory;
  protectionGuidance: string[];
  sourceUrl: string;
}

export interface PublicErrorShape {
  error: string;
  code: string;
  retryable: boolean;
  status?: number;
  retryAfterSeconds?: number;
}

export interface DataGovClientContract {
  getMetadata(datasetId: string): Promise<DatasetMetadata>;
  queryDataset(request: QueryDatasetRequest): Promise<DatastoreResult>;
  downloadGeoJson(datasetId: string): Promise<GeoJsonFeatureCollection>;
  getPsi(): Promise<PsiData>;
  getPm25(): Promise<Pm25Data>;
  getUv(): Promise<UvData>;
}
