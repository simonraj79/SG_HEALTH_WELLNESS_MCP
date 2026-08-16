import type {
  DataGovClientContract,
  DatasetMetadata,
  DatastoreResult,
  GeoJsonFeatureCollection,
  Pm25Data,
  PsiData,
  QueryDatasetRequest,
  UvData,
} from "../src/contracts.js";

export class ContractTestClient implements DataGovClientContract {
  pm25Fails = false;

  async getMetadata(datasetId: string): Promise<DatasetMetadata> {
    return {
      datasetId,
      createdAt: "2024-01-01T00:00:00+08:00",
      name: "Contract dataset",
      collectionIds: [],
      description: "Contract verification dataset",
      format: "CSV",
      lastUpdatedAt: "2026-08-01T00:00:00+08:00",
      managedBy: "Ministry of Health",
      contactEmails: [],
      datasetSize: 100,
      columnMetadata: {
        metaMapping: {
          column: {
            name: "value",
            columnTitle: "Value",
            dataType: "Text",
            index: "0",
            isCategorical: false,
          },
        },
      },
    };
  }

  async queryDataset(request: QueryDatasetRequest): Promise<DatastoreResult> {
    return {
      resource_id: request.datasetId,
      fields: [{ id: "value", type: "text" }],
      records: [{ value: "verified" }],
      total: 1,
      limit: request.limit,
    };
  }

  async downloadGeoJson(_datasetId: string): Promise<GeoJsonFeatureCollection> {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [103.8198, 1.3521] },
          properties: {
            NAME: "Contract Wellness Location",
            DESCRIPTION: "Exercise facility",
            ADDRESSSTREETNAME: "Verification Road",
            ADDRESSPOSTALCODE: "123456",
          },
        },
      ],
    };
  }

  async getPsi(): Promise<PsiData> {
    return {
      items: [
        {
          date: "2026-08-16",
          timestamp: "2026-08-16T12:00:00+08:00",
          updatedTimestamp: "2026-08-16T12:05:00+08:00",
          readings: {
            psi_twenty_four_hourly: { north: 51, south: 48, east: 60, west: 55, central: 58 },
            pm25_twenty_four_hourly: { north: 20, south: 19, east: 25, west: 23, central: 24 },
          },
        },
      ],
    };
  }

  async getPm25(): Promise<Pm25Data> {
    if (this.pm25Fails) throw new Error("Synthetic PM2.5 failure for partial-data verification");
    return {
      items: [
        {
          date: "2026-08-16",
          timestamp: "2026-08-16T12:00:00+08:00",
          updatedTimestamp: "2026-08-16T12:05:00+08:00",
          readings: { pm25_one_hourly: { north: 12, south: 13, east: 14, west: 15, central: 16 } },
        },
      ],
    };
  }

  async getUv(): Promise<UvData> {
    return {
      records: [
        {
          date: "2026-08-16",
          timestamp: "2026-08-16T12:00:00+08:00",
          updatedTimestamp: "2026-08-16T12:05:00+08:00",
          index: [
            { hour: "2026-08-16T11:00:00+08:00", value: 4 },
            { hour: "2026-08-16T12:00:00+08:00", value: 8 },
          ],
        },
      ],
    };
  }
}
