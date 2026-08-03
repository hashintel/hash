import { describe, expect, it } from "vitest";

import {
  buildSiteOccupancyIndex,
  deriveMaterialOccupancy,
  occupancyBatchIdentity,
} from "./site-occupancy-model";

import type {
  SiteProductionTimeline,
  SiteTimelineBatch,
} from "@local/hash-isomorphic-utils/site-production-timeline";

const batch = (
  id: string,
  material: string,
  start: string,
  end: string,
  overrides: Partial<SiteTimelineBatch> = {},
): SiteTimelineBatch => ({
  id,
  material,
  batch: id,
  order: id,
  start,
  end,
  span_days: 1,
  quantity: 1,
  uom: "KG",
  timing_kind: "production_window",
  start_source: "charge_day",
  finish_source: "fill_day",
  derivation: "confirmed",
  building_id: "building",
  line_id: "line-1",
  line_raw: "L1",
  line_source: "campaign_sheet",
  line_confidence: "exact",
  candidate_line_ids: [],
  line_reason: "fixture",
  resource_ids: [],
  campaign_core: null,
  campaign_id: null,
  product_family_key: null,
  allocated_quantity: 0,
  unallocated_quantity: 1,
  allocation_overage_quantity: 0,
  allocation_tolerance: 0.000001,
  data_quality_flags: [],
  ...overrides,
});

const timeline = {
  site_id: "demo",
  date_bounds: { start: "2026-01-01", end: "2026-01-31" },
  lines: [
    {
      id: "line-1",
      name: "Line 1",
      building_id: "building",
      aliases: [],
      kind: "internal_line",
      resource_ids: [],
    },
    {
      id: "line-2",
      name: "Line 2",
      building_id: "building",
      aliases: [],
      kind: "internal_line",
      resource_ids: [],
    },
  ],
  product_families: [],
  batches: [
    batch("focused", "A", "2026-01-02", "2026-01-04", { span_days: 3 }),
    batch("context", "B", "2026-01-03", "2026-01-05", { span_days: 3 }),
    batch("boundary", "B", "2026-01-10", "2026-01-10"),
    batch("receipt", "A", "2026-01-06", "2026-01-06", {
      timing_kind: "receipt_event",
      building_id: null,
      line_id: null,
      line_confidence: "unresolved",
    }),
    batch("mixed-ambiguous", "A", "2026-01-07", "2026-01-08", {
      building_id: null,
      line_id: null,
      line_source: "sap_recipe_operation",
      line_confidence: "ambiguous",
      candidate_line_ids: ["line-1", "line-2"],
    }),
    batch("ambiguous", "C", "2026-01-02", "2026-01-03", {
      building_id: null,
      line_id: null,
      line_confidence: "ambiguous",
      candidate_line_ids: ["line-1", "line-2"],
    }),
  ],
} as unknown as SiteProductionTimeline;

describe("site occupancy model", () => {
  it("indexes once, filters inclusively, marks focus and packs overlaps", () => {
    const index = buildSiteOccupancyIndex(timeline);
    const result = deriveMaterialOccupancy({
      index,
      material: "A",
      start: "2026-01-03",
      end: "2026-01-10",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.batches.map(({ batch: value }) => value.id)).toEqual(
      ["focused", "context", "boundary"],
    );
    expect(result.rows[0]!.batches.map(({ focused }) => focused)).toEqual([
      true,
      false,
      false,
    ]);
    expect(result.rows[0]!.trackCount).toBe(2);
    expect(
      result.rows[0]!.batches.some(
        ({ batch: value }) => value.id === "receipt",
      ),
    ).toBe(false);
    expect(result.receiptEvents.map(({ id }) => id)).toEqual(["receipt"]);
    expect(result.uncertainBatches.map(({ id }) => id)).toEqual([
      "mixed-ambiguous",
    ]);
    expect(result.uncertaintySummary).toEqual({
      batchCount: 1,
      candidateLineIds: ["line-1", "line-2"],
      lineSources: ["sap_recipe_operation"],
    });
  });

  it("does not duplicate ambiguous batches onto candidate lines", () => {
    const result = deriveMaterialOccupancy({
      index: buildSiteOccupancyIndex(timeline),
      material: "C",
      start: "2026-01-01",
      end: "2026-01-31",
    });
    expect(result.rows).toEqual([]);
    expect(result.uncertainBatches.map(({ id }) => id)).toEqual(["ambiguous"]);
    expect(result.uncertaintySummary.candidateLineIds).toEqual([
      "line-1",
      "line-2",
    ]);
  });

  it("keeps only selected occupancy and removes empty line rows", () => {
    const result = deriveMaterialOccupancy({
      index: buildSiteOccupancyIndex(timeline),
      material: "A",
      start: "2026-01-01",
      end: "2026-01-31",
      focusedBatchIdentities: new Set([
        occupancyBatchIdentity({
          material: "A",
          batch: "focused",
          order: "000focused",
        })!,
        occupancyBatchIdentity({
          material: "B",
          batch: "context",
          order: "context",
        })!,
      ]),
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.batches.map(({ batch: value }) => value.id)).toEqual(
      ["focused"],
    );
    expect(result.rows[0]!.trackCount).toBe(1);
    expect(result.uncertainBatches).toEqual([]);
    expect(result.receiptEvents).toEqual([]);
  });

  it("removes focused line rows containing only other materials", () => {
    const result = deriveMaterialOccupancy({
      index: buildSiteOccupancyIndex(timeline),
      material: "A",
      start: "2026-01-01",
      end: "2026-01-31",
      focusedBatchIdentities: new Set([
        occupancyBatchIdentity({
          material: "B",
          batch: "context",
          order: "context",
        })!,
      ]),
    });

    expect(result.rows).toEqual([]);
  });

  it("normalizes padded batchless orders for selection matching", () => {
    expect(
      occupancyBatchIdentity({
        material: "A",
        batch: null,
        order: "000115980728",
      }),
    ).toBe(
      occupancyBatchIdentity({
        material: "A",
        batch: null,
        order: "115980728",
      }),
    );
  });

  it("does not classify receipt-only evidence as uncertain occupancy", () => {
    const result = deriveMaterialOccupancy({
      index: buildSiteOccupancyIndex(timeline),
      material: "A",
      start: "2026-01-06",
      end: "2026-01-06",
    });
    expect(result.uncertainBatches).toEqual([]);
    expect(result.receiptEvents.map(({ id }) => id)).toEqual(["receipt"]);
  });

  it("reports a selected range outside artifact coverage", () => {
    expect(
      deriveMaterialOccupancy({
        index: buildSiteOccupancyIndex(timeline),
        material: "A",
        start: "2025-01-01",
        end: "2025-01-02",
      }).outsideCoverage,
    ).toBe(true);
  });

  it("reports null-bounded empty artifacts without range comparisons", () => {
    const emptyTimeline = {
      ...timeline,
      date_bounds: { start: null, end: null },
      batches: [],
    } as unknown as SiteProductionTimeline;
    const result = deriveMaterialOccupancy({
      index: buildSiteOccupancyIndex(emptyTimeline),
      material: "A",
      start: "2026-01-01",
      end: "2026-01-31",
    });
    expect(result).toMatchObject({
      emptyArtifact: true,
      outsideCoverage: false,
      rows: [],
      uncertainBatches: [],
      receiptEvents: [],
    });
  });

  it("caches repeated range derivation within the occupancy budget", () => {
    const index = buildSiteOccupancyIndex(timeline);
    const first = index.batchesForLineAndRange(
      "line-1",
      "2026-01-01",
      "2026-01-31",
    );
    expect(
      index.batchesForLineAndRange("line-1", "2026-01-01", "2026-01-31"),
    ).toBe(first);

    const startedAt = performance.now();
    for (let iteration = 0; iteration < 10_000; iteration++) {
      deriveMaterialOccupancy({
        index,
        material: "A",
        start: "2026-01-01",
        end: "2026-01-31",
      });
    }
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });
});
