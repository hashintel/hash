import { describe, expect, it } from "vitest";

import { deriveBatchDirectUse, deriveScheduleModel } from "./model";

import type {
  ProductionSchedule,
  ProductionScheduleAllocation,
  ProductionScheduleBatch,
} from "../../../shared/production-schedule-types";

const directAllocation = (
  netQuantity: number,
  materials: string[],
): ProductionScheduleAllocation => ({
  consuming_order: "consume-order",
  consumption_date: "2026-01-10",
  net_quantity: netQuantity,
  status: "selected",
  confidence: "exact",
  reason: "direct output",
  output_candidates: [],
  direct_output_candidates: materials.map((material, index) => ({
    material,
    batch: `${material}-${index}`,
    order: "consume-order",
    output_date: "2026-01-11",
    quantity: netQuantity,
  })),
});

const openAllocation = (netQuantity: number): ProductionScheduleAllocation => ({
  consuming_order: null,
  consumption_date: null,
  net_quantity: netQuantity,
  status: "open",
  confidence: "exact",
  reason: "no recorded consumption",
  output_candidates: [],
  direct_output_candidates: [],
});

const batch = (
  id: string,
  start: string,
  end: string,
  allocations: ProductionScheduleAllocation[],
): ProductionScheduleBatch => {
  const allocatedQuantity = allocations
    .filter((allocation) => allocation.status !== "open")
    .reduce((total, allocation) => total + allocation.net_quantity, 0);
  const unallocatedQuantity = allocations
    .filter((allocation) => allocation.status === "open")
    .reduce((total, allocation) => total + allocation.net_quantity, 0);
  return {
    id,
    material: "input",
    batch: id,
    order: `make-${id}`,
    start,
    end,
    span_days: 2,
    quantity: allocatedQuantity + unallocatedQuantity,
    uom: "KG",
    campaign_core: null,
    campaign_id: null,
    building: null,
    start_source: "charge_day",
    finish_source: "fill_day",
    derivation: "confirmed",
    allocation_status: "selected",
    allocations,
    allocation_totals: {
      selected: allocatedQuantity,
      shared: 0,
      other: 0,
      open: unallocatedQuantity,
      unresolved: 0,
    },
    allocated_quantity: allocatedQuantity,
    unallocated_quantity: unallocatedQuantity,
    allocation_tolerance: 0.000001,
    allocation_tolerance_reason: "rounding",
  };
};

const schedule: ProductionSchedule = {
  schema_version: "1.1",
  artifact_type: "production_schedule",
  artifact_version: "1.1",
  product_id: "product",
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
          ...batch("fg::one", "2026-01-10", "2026-01-11", [
            directAllocation(100, ["fg"]),
          ]),
          material: "fg",
        },
      ],
    },
    {
      material: "intermediate",
      name: "Intermediate",
      bom_depth: 1,
      role: "intermediate",
      uom: "KG",
      campaigns: [
        {
          campaign_core: "old-zeroes",
          campaign_id: null,
          building: null,
          daily_batch_counts: [{ date: "2025-01-01", value: 0 }],
          daily_fill_weights: [{ date: "2025-01-01", value: 0 }],
        },
      ],
      batches: [
        batch("input::one", "2026-01-01", "2026-01-02", [
          directAllocation(60, ["fg"]),
          openAllocation(40),
        ]),
      ],
    },
  ],
};

describe("deriveBatchDirectUse", () => {
  const hierarchy = new Set(["fg", "intermediate", "visible-sibling"]);

  it("keeps all visible direct consumers in the hierarchy state", () => {
    const directUse = deriveBatchDirectUse(
      batch("visible", "2026-01-01", "2026-01-02", [
        directAllocation(60, ["fg"]),
        directAllocation(40, ["visible-sibling"]),
      ]),
      hierarchy,
    );

    expect(directUse.state).toBe("in_hierarchy");
    expect(directUse.consumers).toEqual([
      { material: "fg", quantity: 60, isOutsideHierarchy: false },
      {
        material: "visible-sibling",
        quantity: 40,
        isOutsideHierarchy: false,
      },
    ]);
  });

  it("marks any off-view direct consumer as used elsewhere", () => {
    const directUse = deriveBatchDirectUse(
      batch("shared", "2026-01-01", "2026-01-02", [
        directAllocation(60, ["fg"]),
        directAllocation(40, ["other-product"]),
      ]),
      hierarchy,
    );

    expect(directUse.state).toBe("used_elsewhere");
    expect(directUse.consumers[1]).toEqual({
      material: "other-product",
      quantity: 40,
      isOutsideHierarchy: true,
    });
  });

  it("does not invent a split for a multi-material order", () => {
    const directUse = deriveBatchDirectUse(
      batch("multi-output", "2026-01-01", "2026-01-02", [
        directAllocation(100, ["fg", "other-product"]),
      ]),
      hierarchy,
    );

    expect(directUse.consumers.map(({ quantity }) => quantity)).toEqual([
      null,
      null,
    ]);
  });

  it("distinguishes no consumption from an unknown immediate output", () => {
    const unconsumed = deriveBatchDirectUse(
      batch("open", "2026-01-01", "2026-01-02", [openAllocation(100)]),
      hierarchy,
    );
    const unknown = deriveBatchDirectUse(
      batch("unknown", "2026-01-01", "2026-01-02", [
        {
          ...directAllocation(100, []),
          status: "unresolved",
          confidence: "unresolved",
        },
      ]),
      hierarchy,
    );

    expect(unconsumed).toMatchObject({
      state: "no_recorded_consumption",
      unconsumedQuantity: 100,
      hasUnknownOutput: false,
    });
    expect(unknown).toMatchObject({
      state: "unknown_output",
      hasUnknownOutput: true,
    });
  });
});

describe("deriveScheduleModel", () => {
  it("uses production windows, not zero cadence, for the default domain", () => {
    const model = deriveScheduleModel(schedule, { start: null, end: null });

    expect(model.lanes.map(({ material }) => material)).toEqual([
      "intermediate",
      "fg",
    ]);
    expect(model.start).toBe("2025-12-29");
    expect(model.end).toBe("2026-01-14");
    expect(model.directUseByBatch.get("input::one")).toMatchObject({
      state: "in_hierarchy",
      unconsumedQuantity: 40,
    });
  });

  it("uses explicit range bounds and removes empty lanes", () => {
    const model = deriveScheduleModel(schedule, {
      start: "2026-01-09",
      end: "2026-01-15",
    });

    expect(model.start).toBe("2026-01-09");
    expect(model.end).toBe("2026-01-15");
    expect(model.lanes.map(({ material }) => material)).toEqual(["fg"]);
  });
});
