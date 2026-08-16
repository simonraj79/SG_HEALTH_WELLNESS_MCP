import {
  LOCATION_SOURCE_KEYS,
  TABULAR_SOURCE_KEYS,
  type LocationSourceKey,
  type SourceDefinition,
  type SourceKey,
  type SourceSummary,
  type TabularSourceKey,
} from "./contracts.js";

export const SOURCE_CATALOG = {
  healthier_sg_drugs: {
    key: "healthier_sg_drugs",
    datasetId: "d_2a57d4e672be2a52118ae0bf4a0f4a4b",
    name: "Healthier SG Whitelisted Drugs",
    description: "Medicines and subsidy classifications on the Healthier SG whitelist.",
    agency: "Ministry of Health",
    format: "CSV",
    kind: "tabular",
    sourceUrl: "https://data.gov.sg/datasets/d_2a57d4e672be2a52118ae0bf4a0f4a4b/view",
    supportsFullText: false,
    caution: "This is a subsidy list, not medication advice or a statement that a medicine is suitable for a person.",
  },
  nehr_institutions: {
    key: "nehr_institutions",
    datasetId: "d_2864c425e22ddb89969585820629adf8",
    name: "Institutions Participating in NEHR",
    description: "Organisations and institutions participating in Singapore's National Electronic Health Record system.",
    agency: "Ministry of Health",
    format: "CSV",
    kind: "tabular",
    sourceUrl: "https://data.gov.sg/datasets/d_2864c425e22ddb89969585820629adf8/view",
    supportsFullText: false,
  },
  polyclinic_attendance: {
    key: "polyclinic_attendance",
    datasetId: "d_5d5508f1c954f5630d7b3aa7875d01f9",
    name: "Average Daily Polyclinic Attendances for Selected Diseases",
    description: "Historical average daily attendances by epidemiological week for selected diseases.",
    agency: "Ministry of Health",
    format: "CSV",
    kind: "tabular",
    sourceUrl: "https://data.gov.sg/datasets/d_5d5508f1c954f5630d7b3aa7875d01f9/view",
    supportsFullText: true,
    caution: "The published series is historical and must not be treated as current outbreak surveillance.",
  },
  diseases_conditions: {
    key: "diseases_conditions",
    datasetId: "d_01d45cd7b2113dc0c433bcd5218b67b8",
    name: "Health Diseases and Conditions",
    description: "A compact list of disease and condition labels published by the Ministry of Health.",
    agency: "Ministry of Health",
    format: "CSV",
    kind: "tabular",
    sourceUrl: "https://data.gov.sg/datasets/d_01d45cd7b2113dc0c433bcd5218b67b8/view",
    supportsFullText: false,
  },
  eldercare: {
    key: "eldercare",
    datasetId: "d_f0fd1b3643ed8bd34bd403dedd7c1533",
    name: "Eldercare Services",
    description: "Directory locations for eldercare services in Singapore.",
    agency: "Ministry of Health",
    format: "GEOJSON",
    kind: "location",
    sourceUrl: "https://data.gov.sg/datasets/d_f0fd1b3643ed8bd34bd403dedd7c1533/view",
  },
  parks: {
    key: "parks",
    datasetId: "d_99b71f5d34cf57a3a592fbfdef1f42b6",
    name: "Parks@SG",
    description: "Parks described by HPB as places for relaxation and light exercise.",
    agency: "Health Promotion Board",
    format: "GEOJSON",
    kind: "location",
    sourceUrl: "https://data.gov.sg/datasets/d_99b71f5d34cf57a3a592fbfdef1f42b6/view",
  },
  gyms: {
    key: "gyms",
    datasetId: "d_b3ae090692ecf632116c9885cfbd3424",
    name: "Gyms@SG",
    description: "Gym and exercise-facility locations published by HPB.",
    agency: "Health Promotion Board",
    format: "GEOJSON",
    kind: "location",
    sourceUrl: "https://data.gov.sg/datasets/d_b3ae090692ecf632116c9885cfbd3424/view",
  },
  quit_centres: {
    key: "quit_centres",
    datasetId: "d_527eb9ff7e89d0499f1dcbf85d3f8c32",
    name: "Quit Centres",
    description: "Smoking-cessation centre locations published by HPB.",
    agency: "Health Promotion Board",
    format: "GEOJSON",
    kind: "location",
    sourceUrl: "https://data.gov.sg/datasets/d_527eb9ff7e89d0499f1dcbf85d3f8c32/view",
  },
  healthier_caterers: {
    key: "healthier_caterers",
    datasetId: "d_a93d46bbf91f3a9126a2e08a1982d5ad",
    name: "Healthier Caterers",
    description: "Caterers participating in HPB's healthier-caterer listing.",
    agency: "Health Promotion Board",
    format: "GEOJSON",
    kind: "location",
    sourceUrl: "https://data.gov.sg/datasets/d_a93d46bbf91f3a9126a2e08a1982d5ad/view",
  },
} as const satisfies Record<SourceKey, SourceDefinition>;

export function getSource(key: SourceKey): SourceDefinition {
  return SOURCE_CATALOG[key];
}

export function getTabularSource(key: TabularSourceKey): SourceDefinition {
  return SOURCE_CATALOG[key];
}

export function getLocationSource(key: LocationSourceKey): SourceDefinition {
  return SOURCE_CATALOG[key];
}

export function listSourceSummaries(): SourceSummary[] {
  return Object.values(SOURCE_CATALOG).map((source) => ({ ...source }));
}

export function isTabularSourceKey(value: string): value is TabularSourceKey {
  return (TABULAR_SOURCE_KEYS as readonly string[]).includes(value);
}

export function isLocationSourceKey(value: string): value is LocationSourceKey {
  return (LOCATION_SOURCE_KEYS as readonly string[]).includes(value);
}
