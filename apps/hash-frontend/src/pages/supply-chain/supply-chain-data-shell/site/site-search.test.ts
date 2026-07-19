import { describe, expect, it } from "vitest";

import { siteNodeMatchesSearch, supplierMatchesSearch } from "./site-search";

import type { SiteNode, VendorOtifStats } from "../../shared/types";

const node = {
  id: "raw_dwell_123",
  label: "Raw ingredients at Bristol",
  type: "raw_material_dwell",
  material: "MAT-123",
  plant: "Bristol",
  products: [{ id: "PROD-1", name: "Vitamin tablets" }],
} as SiteNode;

describe("site overview search", () => {
  it("matches step labels, types, materials, and products", () => {
    expect(siteNodeMatchesSearch(node, "ingredients")).toBe(true);
    expect(siteNodeMatchesSearch(node, "raw material dwell")).toBe(true);
    expect(siteNodeMatchesSearch(node, "mat-123 vitamin")).toBe(true);
    expect(siteNodeMatchesSearch(node, "transit")).toBe(false);
  });

  it("matches supplier names, identifiers, and materials", () => {
    const supplier = {
      vendor_id: "V-42",
      vendor_name: "Acme Ingredients",
      materials: [{ matnr: "RM-7", name: "Citric acid" }],
    } as VendorOtifStats;

    expect(supplierMatchesSearch(supplier, "acme rm-7")).toBe(true);
    expect(supplierMatchesSearch(supplier, "citric")).toBe(true);
    expect(supplierMatchesSearch(supplier, "other")).toBe(false);
  });
});
