import type { GeoJsonFeature, GeoJsonFeatureCollection, NormalizedLocation, SourceDefinition } from "./contracts.js";

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLegacyDescription(value: unknown): Record<string, string> {
  if (typeof value !== "string" || !value.includes("<th")) return {};
  const fields: Record<string, string> = {};
  const pattern = /<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  for (const match of value.matchAll(pattern)) {
    const key = match[1] ? decodeHtml(match[1]).toUpperCase() : "";
    const fieldValue = match[2] ? decodeHtml(match[2]) : "";
    if (key && fieldValue) fields[key] = fieldValue;
  }
  return fields;
}

function normalizedProperties(feature: GeoJsonFeature): Record<string, string> {
  const properties = feature.properties ?? {};
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    const text = textValue(value);
    if (text) normalized[key.toUpperCase()] = text;
  }
  return { ...normalized, ...parseLegacyDescription(properties.Description ?? properties.DESCRIPTION) };
}

function buildAddress(properties: Record<string, string>): string | undefined {
  const block = properties.ADDRESSBLOCKHOUSENUMBER;
  const street = properties.ADDRESSSTREETNAME;
  const building = properties.ADDRESSBUILDINGNAME;
  const floor = properties.ADDRESSFLOORNUMBER;
  const unit = properties.ADDRESSUNITNUMBER;
  const line = [block, street].filter(Boolean).join(" ").trim();
  const unitPart = [floor, unit].filter(Boolean).join("-");
  const parts = [line, building, unitPart ? `#${unitPart}` : undefined].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function validSingaporePoint(longitude: number, latitude: number): boolean {
  return longitude >= 103.4 && longitude <= 104.2 && latitude >= 1.1 && latitude <= 1.6;
}

function normalizeFeature(feature: GeoJsonFeature, source: SourceDefinition): NormalizedLocation | undefined {
  if (!feature.geometry || feature.geometry.type !== "Point") return undefined;
  const [longitude, latitude] = feature.geometry.coordinates;
  if (!validSingaporePoint(longitude, latitude)) return undefined;
  const properties = normalizedProperties(feature);
  const rawName = properties.NAME ?? properties.Name?.trim();
  const name = rawName && !/^kml_\d+$/i.test(rawName) ? rawName : undefined;
  if (!name) return undefined;

  const description = properties.DESCRIPTION && !properties.DESCRIPTION.includes("<table") ? decodeHtml(properties.DESCRIPTION) : undefined;
  const address = buildAddress(properties);
  const postalCode = properties.ADDRESSPOSTALCODE;
  return {
    name,
    latitude,
    longitude,
    sourceUrl: source.sourceUrl,
    ...(description ? { description } : {}),
    ...(address ? { address } : {}),
    ...(postalCode ? { postalCode } : {}),
  };
}

export function haversineKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number {
  const radiusKm = 6_371;
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const deltaLat = radians(to.latitude - from.latitude);
  const deltaLon = radians(to.longitude - from.longitude);
  const fromLat = radians(from.latitude);
  const toLat = radians(to.latitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeLocations(
  collection: GeoJsonFeatureCollection,
  source: SourceDefinition,
  options: {
    query?: string;
    origin?: { latitude: number; longitude: number };
  } = {},
): NormalizedLocation[] {
  const normalized = collection.features
    .map((feature) => normalizeFeature(feature, source))
    .filter((location): location is NormalizedLocation => location !== undefined);

  const query = options.query?.trim().toLocaleLowerCase("en-SG");
  const filtered = query
    ? normalized.filter((location) =>
        [location.name, location.description, location.address, location.postalCode]
          .filter((value): value is string => value !== undefined)
          .some((value) => value.toLocaleLowerCase("en-SG").includes(query)),
      )
    : normalized;

  const withDistance = options.origin
    ? filtered.map((location) => ({
        ...location,
        distanceKm: Math.round(haversineKm(options.origin as { latitude: number; longitude: number }, location) * 100) / 100,
      }))
    : filtered;

  return withDistance.sort((left, right) => {
    if (left.distanceKm !== undefined && right.distanceKm !== undefined) return left.distanceKm - right.distanceKm;
    return left.name.localeCompare(right.name, "en-SG");
  });
}
