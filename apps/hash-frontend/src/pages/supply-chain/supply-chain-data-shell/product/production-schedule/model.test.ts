import { describe, expect, it } from "vitest";

import { deriveScheduleModel } from "./model";

import type { ProductionSchedule } from "../../../shared/production-schedule-types";

const schedule = {
  schema_version: "1.1",
  artifact_type: "production_schedule",
  artifact_version: "1.0",
  product_id: "p",
  product_name: "Product",
  product_material: "fg",
  plant: "P",
  quantity_tolerance: 0.000001,
  source: {
    production_windows: "windows",
    cadence: "cadence",
    allocations: "allocations",
    order_outputs: "outputs",
  },
  consumption_evidence: [],
  lanes: [
    {
      material: "fg",
      name: "Finished",
      bom_depth: 0,
      role: "finished_good",
      uom: "KG",
      campaigns: [],
      batches: [
        {
          id: "fg::A",
          material: "fg",
          batch: "A",
          order: "O-A",
          start: "2026-01-10",
          end: "2026-01-11",
          span_days: 2,
          quantity: 100,
          uom: "KG",
          campaign_core: "C",
          campaign_id: "campaign",
          building: "B",
          start_source: "charge_day",
          finish_source: "fill_day",
          derivation: "confirmed",
          allocation_status: "selected",
          allocations: [],
          allocation_totals: {
            selected: 100,
            shared: 0,
            other: 0,
            open: 0,
            unresolved: 0,
          },
          allocated_quantity: 100,
          unallocated_quantity: 0,
          allocation_tolerance: 0.000001,
          allocation_tolerance_reason: "rounding",
        },
      ],
    },
    {
      material: "input",
      name: "Input",
      bom_depth: 1,
      role: "intermediate",
      uom: "KG",
      campaigns: [
        {
          campaign_core: "C",
          campaign_id: "campaign",
          building: "B",
          sheet: "202601",
          daily_batch_counts: [
            { date: "2026-01-01", value: 1 },
            { date: "2026-01-06", value: 1 },
            { date: "2026-01-07", value: 1 },
          ],
          daily_fill_weights: [{ date: "2026-01-09", value: 100 }],
        },
      ],
      batches: [
        {
          id: "input::1",
          material: "input",
          batch: "I1",
          order: "I-1",
          start: "2026-01-01",
          end: "2026-01-02",
          span_days: 2,
          quantity: 100,
          uom: "KG",
          campaign_core: "C",
          campaign_id: "campaign",
          building: "B",
          start_source: "waterline",
          finish_source: "fill_day",
          derivation: "confirmed",
          allocation_status: "shared",
          allocations: [
            {
              consuming_order: "O-A",
              consumption_date: "2026-01-10",
              net_quantity: 60,
              status: "shared",
              confidence: "candidate",
              reason: "mixed outputs",
              output_candidates: [
                {
                  material: "fg",
                  batch: "A",
                  order: "O-A",
                  product_relation: "selected",
                  path: ["O-A"],
                },
              ],
            },
            {
              consuming_order: null,
              consumption_date: null,
              net_quantity: 40,
              status: "open",
              confidence: "exact",
              reason: "not consumed",
              output_candidates: [],
            },
          ],
          allocation_totals: {
            selected: 0,
            shared: 60,
            other: 0,
            open: 40,
            unresolved: 0,
          },
          allocated_quantity: 60,
          unallocated_quantity: 40,
          allocation_tolerance: 0.000001,
          allocation_tolerance_reason: "rounding",
        },
        {
          id: "input::2",
          material: "input",
          batch: "I2",
          order: "I-2",
          start: "2026-01-06",
          end: "2026-01-07",
          span_days: 2,
          quantity: 100,
          uom: "KG",
          campaign_core: "C",
          campaign_id: "campaign",
          building: "B",
          start_source: "charge_day",
          finish_source: "fill_day",
          derivation: "confirmed",
          allocation_status: "open",
          allocations: [],
          allocation_totals: {
            selected: 0,
            shared: 0,
            other: 0,
            open: 100,
            unresolved: 0,
          },
          allocated_quantity: 0,
          unallocated_quantity: 100,
          allocation_tolerance: 0.000001,
          allocation_tolerance_reason: "rounding",
        },
      ],
    },
  ],
} satisfies ProductionSchedule;

const filters = {
  start: null,
  end: null,
  material: null,
  role: "all" as const,
  campaign: null,
  status: "all" as const,
  minGapDays: 2,
};

describe("deriveScheduleModel", () => {
  it("orders lanes, derives gaps and allocation KPIs", () => {
    const model = deriveScheduleModel(schedule, filters, null);
    expect(model.lanes.map(({ material }) => material)).toEqual([
      "input",
      "fg",
    ]);
    expect(model.gaps).toEqual([
      {
        laneMaterial: "input",
        start: "2026-01-03",
        end: "2026-01-05",
        days: 3,
      },
    ]);
    expect(model.kpis).toMatchObject({
      campaigns: 1,
      batches: 3,
      activeDays: 4,
      medianGapDays: 3,
      longestGapDays: 3,
      longestRunDays: 2,
      selectedQuantity: [
        { material: "fg", name: "Finished", uom: "KG", value: 100 },
      ],
      sharedQuantity: [
        { material: "input", name: "Input", uom: "KG", value: 60 },
      ],
      openQuantity: [
        { material: "input", name: "Input", uom: "KG", value: 140 },
      ],
    });
    expect(model.maxFillWeight).toBe(100);
  });

  it("marks exact and candidate lineage for a selected FG batch", () => {
    const model = deriveScheduleModel(schedule, filters, "A");
    expect(model.lineage.get("fg::A")).toBe("exact");
    expect(model.lineage.get("input::1")).toBe("candidate");
    expect(model.lineage.has("input::2")).toBe(false);
  });

  it("filters status without applying global outlier state", () => {
    const model = deriveScheduleModel(
      schedule,
      { ...filters, status: "open" },
      null,
    );
    expect(
      model.lanes.flatMap(({ batches }) => batches).map(({ id }) => id),
    ).toEqual(["input::1", "input::2"]);
  });

  it("does not retain out-of-range campaigns as blank lanes", () => {
    const model = deriveScheduleModel(
      schedule,
      {
        ...filters,
        start: "2030-01-01",
        end: "2030-01-31",
      },
      null,
    );
    expect(model.lanes).toEqual([]);
  });

  it("calculates gaps from all production, not the status-filtered subset", () => {
    const gapSchedule: ProductionSchedule = structuredClone(schedule);
    const inputLane = gapSchedule.lanes.find(
      ({ material }) => material === "input",
    )!;
    for (const batch of inputLane.batches) {
      batch.allocation_status = "selected";
      batch.allocation_totals = {
        selected: batch.quantity ?? 0,
        shared: 0,
        other: 0,
        open: 0,
        unresolved: 0,
      };
    }
    inputLane.batches.push({
      ...structuredClone(inputLane.batches[0]!),
      id: "input::hidden",
      batch: "HIDDEN",
      start: "2026-01-03",
      end: "2026-01-05",
      span_days: 3,
      allocation_status: "open",
      allocation_totals: {
        selected: 0,
        shared: 0,
        other: 0,
        open: 100,
        unresolved: 0,
      },
    });
    const model = deriveScheduleModel(
      gapSchedule,
      { ...filters, status: "selected", minGapDays: 1 },
      null,
    );
    expect(
      model.gaps.filter(({ laneMaterial }) => laneMaterial === "input"),
    ).toEqual([]);
  });
});
