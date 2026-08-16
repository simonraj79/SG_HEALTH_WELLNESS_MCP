import assert from "node:assert/strict";
import test from "node:test";

import { getLocationSource } from "../src/catalog.js";
import { normalizeLocations } from "../src/geojson.js";

test("normalizes legacy HTML-table GeoJSON attributes", () => {
  const result = normalizeLocations(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [103.8, 1.3] },
          properties: {
            Name: "kml_1",
            Description:
              "<table><tr><th>NAME</th><td>Legacy Park</td></tr><tr><th>ADDRESSSTREETNAME</th><td>Park Road</td></tr><tr><th>ADDRESSPOSTALCODE</th><td>123456</td></tr></table>",
          },
        },
      ],
    },
    getLocationSource("parks"),
  );
  assert.equal(result[0]?.name, "Legacy Park");
  assert.equal(result[0]?.address, "Park Road");
  assert.equal(result[0]?.postalCode, "123456");
});

test("drops invalid coordinates and supports text filtering", () => {
  const result = normalizeLocations(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: { NAME: "Invalid point" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [103.81, 1.31] },
          properties: { NAME: "Healthy Kitchen", DESCRIPTION: "Healthier Caterer" },
        },
      ],
    },
    getLocationSource("healthier_caterers"),
    { query: "kitchen" },
  );
  assert.deepEqual(result.map((location) => location.name), ["Healthy Kitchen"]);
});
