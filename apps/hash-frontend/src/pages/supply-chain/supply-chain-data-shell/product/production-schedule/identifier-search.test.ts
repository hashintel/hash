import { describe, expect, it } from "vitest";

import {
  findScheduleIdentifierMatch,
  normalizeScheduleIdentifier,
} from "./identifier-search";

import type {
  ProductionScheduleLegacy,
  ProductionScheduleV12,
  ProductionScheduleV12Batch,
} from "../../../shared/production-schedule-types";

const schedule: ProductionScheduleLegacy = {
  schema_version: "1.1",
  artifact_type: "production_schedule",
  artifact_version: "1.1",
  product_id: "product",
  product_name: "Product",
  product_material: "FG",
  plant: "SITE",
  quantity_tolerance: 0.000001,
  source: {
    allocations: "test",
    cadence: "test",
    order_outputs: "test",
    production_windows: "test",
  },
  consumption_evidence: [],
  lanes: [
    {
      material: "RAW",
      name: "Raw",
      bom_depth: 1,
      role: "raw_material",
      uom: "KG",
      campaigns: [],
      batches: [
        {
          id: "RAW::BATCH-7",
          material: "RAW",
          batch: "BATCH-7",
          order: "00001234",
          start: "2026-01-01",
          end: "2026-01-02",
          span_days: 2,
          quantity: 10,
          uom: "KG",
          campaign_core: null,
          campaign_id: null,
          building: null,
          start_source: "receipt_date",
          finish_source: "receipt_date",
          derivation: "test",
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
          allocation_tolerance_reason: "test",
          allocations: [],
        },
      ],
    },
  ],
  dispatch_events: [
    {
      id: "dispatch-1",
      batch_id: "RAW::BATCH-7",
      material: "RAW",
      batch: "BATCH-7",
      dispatch_date: "2026-01-03",
      quantity: 5,
      uom: "KG",
      bwart: "601",
      episode_scope: "in_episode",
      delivery_coverage: "exact",
      deliveries: [
        {
          delivery_number: "00005678",
          delivery_item: "10",
          shipment_number: "SHIP-9",
          sales_order: "00009999",
        },
      ],
    },
    {
      id: "dispatch-2",
      batch_id: "RAW::BATCH-7",
      material: "RAW",
      batch: "BATCH-7",
      dispatch_date: "2026-01-04",
      quantity: 5,
      uom: "KG",
      bwart: "601",
      episode_scope: "in_episode",
      delivery_coverage: "exact",
      deliveries: [
        {
          delivery_number: "00005679",
          delivery_item: "10",
          sales_order: "00009999",
        },
      ],
    },
  ],
};

const v12Batch = (
  id: string,
  material: string,
  batch: string,
): ProductionScheduleV12Batch => ({
  id,
  material,
  batch,
  order: `ORDER-${batch}`,
  start: "2026-01-01",
  end: "2026-01-02",
  span_days: 2,
  quantity: 10,
  uom: "KG",
  campaign_core: null,
  campaign_id: null,
  building: null,
  start_source: "charge_day",
  finish_source: "fill_day",
  derivation: "test",
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
  allocation_tolerance_reason: "test",
  timing_kind: "production_window",
  allocation_overage_quantity: 0,
  consumption_event_ids: [],
  lifecycle_start: "2026-01-01",
  lifecycle_end: "2026-01-02",
  lifecycle_end_reason: "open",
  lifecycle_balance_status: "balanced",
  lifecycle_overage_quantity: 0,
  remaining_quantity: 10,
  last_exit_date: null,
  lifecycle_exit_quantity: 0,
});

describe("production schedule identifier search", () => {
  it("normalizes numeric identifiers without changing non-numeric batches", () => {
    expect(normalizeScheduleIdentifier(" 00001234 ")).toBe("1234");
    expect(normalizeScheduleIdentifier(" Batch-7 ")).toBe("batch-7");
    expect(normalizeScheduleIdentifier("I-123")).toBe("i-123");
  });

  it("maps batch and production order identifiers to the batch", () => {
    expect(findScheduleIdentifierMatch(schedule, "BATCH-7")).toMatchObject({
      identifierType: "batch",
      laneRole: "raw_material",
      selection: { kind: "batch", batchId: "RAW::BATCH-7" },
    });
    expect(findScheduleIdentifierMatch(schedule, "1234")).toMatchObject({
      identifierType: "production_order",
      selection: { kind: "batch", batchId: "RAW::BATCH-7" },
    });
  });

  it("centers a batch on its rendered production interval", () => {
    const longLifecycleSchedule = structuredClone(schedule);
    const longLifecycleBatch = longLifecycleSchedule.lanes[0]!.batches[0]!;
    longLifecycleBatch.lifecycle_end = "2026-12-31";

    expect(
      findScheduleIdentifierMatch(longLifecycleSchedule, "BATCH-7")?.date,
    ).toBe("2026-01-01");
  });

  it("maps delivery and sales orders to all matching dispatches", () => {
    expect(findScheduleIdentifierMatch(schedule, "5678")).toMatchObject({
      identifierType: "delivery",
      selection: { kind: "dispatch", eventIds: ["dispatch-1"] },
    });
    expect(findScheduleIdentifierMatch(schedule, "9999")).toMatchObject({
      identifierType: "sales_order",
      selection: {
        kind: "dispatch",
        eventIds: ["dispatch-1", "dispatch-2"],
      },
    });
  });

  it("returns null for an unknown identifier", () => {
    expect(findScheduleIdentifierMatch(schedule, "missing")).toBeNull();
  });

  it("ignores batches and dispatches outside the rendered product lineage", () => {
    const unrelatedBatch = v12Batch("OTHER::UNRELATED", "OTHER", "UNRELATED");
    const v12Schedule: ProductionScheduleV12 = {
      schema_version: "1.2",
      artifact_type: "production_schedule",
      artifact_version: "1.2",
      product_id: "product",
      product_name: "Product",
      product_material: "FG",
      plant: "SITE",
      quantity_tolerance: 0.000001,
      lanes: [
        {
          material: "FG",
          name: "Finished good",
          bom_depth: 0,
          role: "finished_good",
          uom: "KG",
          campaigns: [],
          batches: [v12Batch("FG::VISIBLE", "FG", "VISIBLE")],
        },
        {
          material: "OTHER",
          name: "Unrelated",
          bom_depth: 1,
          role: "intermediate",
          uom: "KG",
          campaigns: [],
          batches: [unrelatedBatch],
        },
      ],
      consumption_events: [],
      batch_links: [],
      dispatch_events: [
        {
          id: "unrelated-dispatch",
          batch_id: unrelatedBatch.id,
          material: unrelatedBatch.material,
          batch: unrelatedBatch.batch!,
          dispatch_date: "2026-01-02",
          quantity: 1,
          uom: "KG",
          bwart: "601",
          episode_scope: "in_episode",
          delivery_coverage: "none",
          deliveries: [],
        },
      ],
      source: {
        production_windows: "test",
        cadence: "test",
        consumption_events: "test",
        order_outputs: "test",
        dispatches: "test",
      },
    };

    expect(findScheduleIdentifierMatch(v12Schedule, "UNRELATED")).toBeNull();
    expect(
      findScheduleIdentifierMatch(v12Schedule, "unrelated-dispatch"),
    ).toBeNull();
  });
});
