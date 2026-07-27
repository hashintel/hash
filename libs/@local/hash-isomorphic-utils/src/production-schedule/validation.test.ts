import { describe, expect, it } from "vitest";

import { parseProductionSchedule } from "../production-schedule.js";

import type { ProductionScheduleLegacy } from "./schema.js";

const legacySchedule = (): ProductionScheduleLegacy => ({
  schema_version: "1.1",
  artifact_type: "production_schedule",
  artifact_version: "1.1",
  product_id: "product",
  product_name: "Product",
  product_material: "1000",
  plant: "PLANT",
  quantity_tolerance: 0.000001,
  source: {
    production_windows: "windows",
    cadence: "cadence",
    allocations: "allocations",
    order_outputs: "outputs",
  },
  lanes: [
    {
      material: "1000",
      name: "Product",
      bom_depth: 0,
      role: "finished_good",
      uom: "KG",
      campaigns: [],
      batches: [
        {
          id: "1000::B1",
          material: "1000",
          batch: "B1",
          order: "ORDER",
          start: "2026-01-30",
          end: "2026-02-01",
          span_days: 3,
          quantity: 10,
          uom: "KG",
          campaign_core: null,
          campaign_id: null,
          building: null,
          start_source: "charge_day",
          finish_source: "fill_day",
          derivation: "legacy",
          allocation_status: "open",
          allocation_totals: {
            selected: 0,
            shared: 0,
            other: 0,
            open: 10,
            unresolved: 0,
          },
          allocated_quantity: 0,
          unallocated_quantity: 10,
          allocation_tolerance: 0.000001,
          allocation_tolerance_reason: "rounding",
          allocations: [],
        },
      ],
    },
  ],
  consumption_evidence: [],
});

describe("parseProductionSchedule", () => {
  it("accepts a structurally and semantically valid legacy schedule", () => {
    expect(parseProductionSchedule(legacySchedule(), "product")).toBeTruthy();
  });

  it("rejects a span that disagrees with the inclusive dates", () => {
    const schedule = legacySchedule();
    schedule.lanes[0]!.batches[0]!.span_days = 2;
    expect(() => parseProductionSchedule(schedule, "product")).toThrow(
      /span_days/,
    );
  });

  it("rejects malformed dispatch evidence on legacy artifacts", () => {
    expect(() =>
      parseProductionSchedule(
        { ...legacySchedule(), dispatch_events: [{}] },
        "product",
      ),
    ).toThrow();
  });
});
