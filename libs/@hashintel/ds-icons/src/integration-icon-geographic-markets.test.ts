import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { integrationIconCatalog } from "./integration-icon-catalog";
import { integrationIconGeographicMarkets } from "./integration-icon-geographic-markets";

describe("brand geographic markets", () => {
  it("publishes the reviewed source data for every identity without adding it to the icon catalogue", () => {
    const source: unknown = JSON.parse(
      readFileSync(
        new URL("./integration-icon/geographic-markets.json", import.meta.url),
        "utf8",
      ),
    );
    expect(integrationIconGeographicMarkets).toEqual(source);
    expect(Object.keys(integrationIconGeographicMarkets).sort()).toEqual(
      integrationIconCatalog.map(({ name }) => name).sort(),
    );
    expect(integrationIconGeographicMarkets.genericApp).toBeNull();
    for (const icon of integrationIconCatalog) {
      expect(icon).not.toHaveProperty("geographicMarkets");
      if (icon.name !== "genericApp") {
        expect(integrationIconGeographicMarkets[icon.name]).not.toBeNull();
      }
    }
  });

  it("separates national retail, multinational services and international brands", () => {
    expect(integrationIconGeographicMarkets.rewe).toMatchObject({
      scope: "country",
      countries: ["DE"],
      assessment: "source-supported",
    });
    expect(integrationIconGeographicMarkets.nationalGrid).toMatchObject({
      scope: "regional",
      countries: ["GB", "US"],
      countryCoverage: "partial",
    });
    expect(integrationIconGeographicMarkets.apple).toMatchObject({
      scope: "global",
      countries: [],
      countryCoverage: "not-enumerated",
    });
  });

  it("distinguishes legacy artwork from historical service footprints", () => {
    const { relatedBrand, notes, referenceUrls, ...legacy } =
      integrationIconGeographicMarkets.granolaLegacy;
    expect(relatedBrand).toBe("granola");
    expect(integrationIconGeographicMarkets.granola).toMatchObject(legacy);
    expect(notes).toContain("Legacy artwork");
    expect(referenceUrls).toEqual(expect.any(Array));
    expect(integrationIconGeographicMarkets.skypeLegacy.temporalContext).toBe(
      "historical",
    );
  });
});
