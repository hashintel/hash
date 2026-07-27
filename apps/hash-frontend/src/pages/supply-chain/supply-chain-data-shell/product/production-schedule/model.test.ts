import { describe, expect, it } from "vitest";

import {
  batchLifecycleEnd,
  batchRenderEnd,
  batchVisibleRange,
  clusterEventsByPixel,
  deriveBatchDirectUse,
  deriveScheduleModel,
  deriveScheduleTrace,
  focusScheduleLanes,
  hasOpenResidual,
  intervalPercent,
  packBatchTracks,
  productionScheduleRelevantBatchIds,
  relatedBatchIds,
} from "./model";

import type {
  ProductionSchedule,
  ProductionScheduleAllocation,
  ProductionScheduleConsumptionEvent,
  ProductionScheduleDispatchEvent,
  ProductionScheduleLegacyBatch,
  ProductionScheduleV12,
  ProductionScheduleV12Batch,
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
): ProductionScheduleLegacyBatch => {
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

const asV12Batch = (
  legacy: ProductionScheduleLegacyBatch,
  consumptionEventIds: string[],
  lifecycleEndReason: "depleted" | "open" = "depleted",
): ProductionScheduleV12Batch => {
  const { allocations: _allocations, ...base } = legacy;
  return {
    ...base,
    timing_kind: legacy.timing_kind ?? "production_window",
    allocation_overage_quantity: legacy.allocation_overage_quantity ?? 0,
    consumption_event_ids: consumptionEventIds,
    lifecycle_start: legacy.lifecycle_start ?? legacy.start,
    lifecycle_end: legacy.lifecycle_end ?? legacy.end,
    lifecycle_end_reason: lifecycleEndReason,
    lifecycle_balance_status: "balanced",
    lifecycle_overage_quantity: 0,
    remaining_quantity:
      lifecycleEndReason === "open"
        ? Math.max(legacy.unallocated_quantity, legacy.allocation_tolerance * 2)
        : 0,
    last_exit_date: null,
    lifecycle_exit_quantity:
      lifecycleEndReason === "open"
        ? Math.max(
            0,
            (legacy.quantity ?? 0) -
              Math.max(
                legacy.unallocated_quantity,
                legacy.allocation_tolerance * 2,
              ),
          )
        : (legacy.quantity ?? 0),
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

const v12Schedule = ({
  events,
  links = [],
  dispatchEvents = [],
}: {
  events: ProductionScheduleConsumptionEvent[];
  links?: ProductionScheduleV12["batch_links"];
  dispatchEvents?: ProductionScheduleV12["dispatch_events"];
}): ProductionScheduleV12 => ({
  schema_version: schedule.schema_version,
  artifact_type: schedule.artifact_type,
  artifact_version: "1.2",
  product_id: schedule.product_id,
  product_name: schedule.product_name,
  product_material: schedule.product_material,
  plant: schedule.plant,
  quantity_tolerance: schedule.quantity_tolerance,
  source: {
    production_windows: schedule.source.production_windows,
    cadence: schedule.source.cadence,
    consumption_events: "events",
    order_outputs: schedule.source.order_outputs,
    dispatches: schedule.source.dispatches,
  },
  consumption_events: events,
  batch_links: links,
  dispatch_events: dispatchEvents,
  lanes: schedule.lanes.map((lane) => ({
    ...lane,
    batches: lane.batches.map((item) =>
      asV12Batch(
        item,
        events
          .filter((event) => event.source_batch_id === item.id)
          .map((event) => event.id),
        item.unallocated_quantity > item.allocation_tolerance
          ? "open"
          : "depleted",
      ),
    ),
  })),
});

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

  it("uses compact direct-consumer materials for raw batches", () => {
    const rawBatch = batch("raw", "2026-01-01", "2026-01-02", [
      {
        ...directAllocation(40, []),
        direct_consumer_materials: ["intermediate"],
      },
    ]);

    expect(deriveBatchDirectUse(rawBatch, hierarchy)).toMatchObject({
      state: "in_hierarchy",
      consumers: [
        {
          material: "intermediate",
          quantity: 40,
          isOutsideHierarchy: false,
        },
      ],
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

  it("accounts for finished-good dispatch before reporting unconsumed quantity", () => {
    const dispatchedBatch = batch("dispatched", "2026-01-01", "2026-01-02", [
      openAllocation(100),
    ]);
    const dispatch: ProductionScheduleDispatchEvent = {
      id: "dispatch-as-fg",
      batch_id: dispatchedBatch.id,
      material: dispatchedBatch.material,
      batch: dispatchedBatch.batch!,
      dispatch_date: "2026-01-03",
      quantity: 100,
      uom: "KG",
      bwart: "601",
      episode_scope: "in_episode",
      delivery_coverage: "none",
      deliveries: [],
    };

    expect(
      deriveBatchDirectUse(dispatchedBatch, hierarchy, undefined, [dispatch]),
    ).toMatchObject({
      state: "dispatched_as_fg",
      dispatchedQuantity: 100,
      unconsumedQuantity: 0,
    });
  });
});

describe("deriveScheduleModel", () => {
  it("keeps only batches connected upstream to the selected product", () => {
    const events: ProductionScheduleConsumptionEvent[] = [
      {
        id: "linked-use",
        source_batch_id: "input::one",
        consuming_order: "make-fg::one",
        consumption_date: "2026-01-09",
        episode_scope: "in_episode",
        net_quantity: 60,
        status: "selected",
        confidence: "exact",
        reason: "linked",
        direct_consumer_materials: ["fg"],
      },
      {
        id: "order-material-use",
        source_batch_id: "input::order-material",
        consuming_order: "make-fg::one",
        consumption_date: "2026-01-08",
        episode_scope: "in_episode",
        net_quantity: 20,
        status: "unresolved",
        confidence: "unresolved",
        reason: "target batch unavailable",
        direct_consumer_materials: ["fg"],
      },
      {
        id: "outside-use",
        source_batch_id: "input::outside",
        consuming_order: "outside-order",
        consumption_date: "2020-01-02",
        episode_scope: "post_depletion",
        net_quantity: 20,
        status: "selected",
        confidence: "exact",
        reason: "outside product scope",
        direct_consumer_materials: ["other-product"],
      },
    ];
    const scopedSchedule = v12Schedule({
      events,
      links: [
        {
          id: "linked-use-to-fg",
          event_id: "linked-use",
          target_batch_ids: ["fg::one"],
        },
      ],
    });
    const inputLane = scopedSchedule.lanes.find(
      ({ material }) => material === "intermediate",
    )!;
    inputLane.batches.push(
      asV12Batch(
        batch("input::order-material", "2026-01-03", "2026-01-04", []),
        ["order-material-use"],
      ),
      asV12Batch(batch("input::outside", "2020-01-01", "2020-01-02", []), [
        "outside-use",
      ]),
      asV12Batch(
        batch("input::disconnected", "2019-01-01", "2019-01-02", []),
        [],
      ),
    );

    expect(
      [...productionScheduleRelevantBatchIds(scopedSchedule)].sort(),
    ).toEqual(["fg::one", "input::one", "input::order-material"]);

    const model = deriveScheduleModel(scopedSchedule, {
      start: null,
      end: null,
    });
    const displayedBatchIds = model.lanes.flatMap((lane) =>
      lane.batches.map((item) => item.id),
    );
    expect(displayedBatchIds).toEqual(
      expect.arrayContaining([
        "fg::one",
        "input::one",
        "input::order-material",
      ]),
    );
    expect(displayedBatchIds).not.toEqual(
      expect.arrayContaining(["input::outside", "input::disconnected"]),
    );
    expect(model.start).toBe("2025-12-29");
  });

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

  it("retains unlinked consumption events and dispatch evidence", () => {
    const event: ProductionScheduleConsumptionEvent = {
      id: "unlinked-use",
      source_batch_id: "input::one",
      consuming_order: "missing-output",
      consumption_date: "2026-01-02",
      episode_scope: "in_episode",
      net_quantity: 12,
      status: "unresolved",
      confidence: "unresolved",
      reason: "output outside artifact",
      direct_consumer_materials: [],
    };
    const normalized = v12Schedule({
      events: [event],
      dispatchEvents: [
        {
          id: "dispatch",
          batch_id: "fg::one",
          material: "fg",
          batch: "fg::one",
          dispatch_date: "2026-01-11",
          quantity: 5,
          uom: "KG",
          bwart: "601",
          episode_scope: "in_episode",
          delivery_coverage: "none",
          deliveries: [],
        },
      ],
    });

    const model = deriveScheduleModel(normalized, {
      start: null,
      end: null,
    });

    expect(model.consumptionEventsByBatch.get("input::one")).toEqual([event]);
    expect(model.linksByEvent.has(event.id)).toBe(false);
    expect(model.dispatchesByBatch.get("fg::one")?.[0]?.id).toBe("dispatch");
  });

  it("includes production, event, dispatch, and delivery dates in the domain", () => {
    const normalized = v12Schedule({
      events: [
        {
          id: "early-event",
          source_batch_id: "input::one",
          consuming_order: null,
          consumption_date: "2025-12-20",
          episode_scope: "pre_receipt",
          net_quantity: 1,
          status: "unresolved",
          confidence: "unresolved",
          reason: "before receipt",
          direct_consumer_materials: [],
        },
      ],
      links: [
        {
          id: "early-event-to-fg",
          event_id: "early-event",
          target_batch_ids: ["fg::one"],
        },
      ],
      dispatchEvents: [
        {
          id: "late-dispatch",
          batch_id: "fg::one",
          material: "fg",
          batch: "one",
          dispatch_date: "2026-01-12",
          quantity: 1,
          uom: "KG",
          bwart: "601",
          episode_scope: "in_episode",
          delivery_coverage: "exact",
          deliveries: [
            {
              delivery_number: "D1",
              delivery_item: "10",
              planned_arrival_date: "2026-02-01",
            },
          ],
        },
      ],
    });

    expect(
      deriveScheduleModel(normalized, { start: null, end: null }),
    ).toMatchObject({
      start: "2025-12-17",
      end: "2026-02-04",
    });
  });

  it("keeps complete-lane track ids stable across filtering", () => {
    const overlapping = Array.from({ length: 7 }, (_, index) => ({
      ...batch(
        `input::overlap-${index}`,
        "2026-01-01",
        index === 6 ? "2026-01-20" : "2026-01-10",
        [],
      ),
      material: "intermediate",
    }));
    const overloaded: ProductionSchedule = {
      ...schedule,
      lanes: [
        {
          ...schedule.lanes[1]!,
          batches: overlapping,
        },
      ],
    };
    const complete = deriveScheduleModel(overloaded, {
      start: null,
      end: null,
    });
    const filtered = deriveScheduleModel(overloaded, {
      start: "2026-01-15",
      end: "2026-01-25",
    });

    expect(complete.lanes[0]?.trackCount).toBe(7);
    expect(filtered.lanes[0]?.packedBatches).toMatchObject([
      { batch: { id: "input::overlap-6" }, track: 6 },
    ]);
  });
});

describe("batch relationship graph", () => {
  it("walks recursively upstream and downstream", () => {
    const downstream = new Map([
      ["raw", new Set(["intermediate"])],
      ["intermediate", new Set(["finished"])],
    ]);
    const upstream = new Map([
      ["intermediate", new Set(["raw"])],
      ["finished", new Set(["intermediate"])],
    ]);

    expect(
      [...relatedBatchIds(downstream, upstream, "finished")].sort(),
    ).toEqual(["finished", "intermediate", "raw"]);
    expect([...relatedBatchIds(downstream, upstream, "raw")].sort()).toEqual([
      "finished",
      "intermediate",
      "raw",
    ]);
  });

  it("does not bounce from an ancestor into sibling or cousin branches", () => {
    const downstream = new Map([
      ["raw", new Set(["selected-middle", "sibling-middle"])],
      ["selected-middle", new Set(["selected-finished"])],
      ["sibling-middle", new Set(["cousin-finished"])],
    ]);
    const upstream = new Map([
      ["selected-middle", new Set(["raw"])],
      ["sibling-middle", new Set(["raw"])],
      ["selected-finished", new Set(["selected-middle"])],
      ["cousin-finished", new Set(["sibling-middle"])],
    ]);

    expect(
      [...relatedBatchIds(downstream, upstream, "selected-middle")].sort(),
    ).toEqual(["raw", "selected-finished", "selected-middle"]);
  });

  it("derives event-aware traces without crossing sibling branches", () => {
    const eventOne: ProductionScheduleConsumptionEvent = {
      id: "use-one",
      source_batch_id: "input::one",
      consuming_order: "make-fg::one",
      consumption_date: "2026-01-10",
      episode_scope: "in_episode",
      net_quantity: 10,
      status: "selected",
      confidence: "exact",
      reason: "direct output",
      direct_consumer_materials: ["fg"],
    };
    const eventTwo: ProductionScheduleConsumptionEvent = {
      ...eventOne,
      id: "use-two",
      consuming_order: "make-fg::two",
    };
    const linked = v12Schedule({
      events: [eventOne, eventTwo],
      links: [
        {
          id: "link-one",
          event_id: eventOne.id,
          target_batch_ids: ["fg::one"],
        },
        {
          id: "link-two",
          event_id: eventTwo.id,
          target_batch_ids: ["fg::two"],
        },
      ],
      dispatchEvents: [
        {
          id: "dispatch-one",
          batch_id: "fg::one",
          material: "fg",
          batch: "one",
          dispatch_date: "2026-01-11",
          quantity: 5,
          uom: "KG",
          bwart: "601",
          episode_scope: "in_episode",
          delivery_coverage: "none",
          deliveries: [],
        },
        {
          id: "dispatch-two",
          batch_id: "fg::two",
          material: "fg",
          batch: "two",
          dispatch_date: "2026-01-11",
          quantity: 5,
          uom: "KG",
          bwart: "601",
          episode_scope: "in_episode",
          delivery_coverage: "none",
          deliveries: [],
        },
      ],
    });
    linked.lanes[0]!.batches.push({
      ...linked.lanes[0]!.batches[0]!,
      id: "fg::two",
      batch: "two",
      order: "make-fg::two",
    });
    const model = deriveScheduleModel(linked, { start: null, end: null });

    const batchTrace = deriveScheduleTrace(model, {
      kind: "batch",
      batchId: "fg::one",
    });
    expect([...batchTrace.batchIds].sort()).toEqual(["fg::one", "input::one"]);
    expect([...batchTrace.consumptionEventIds]).toEqual(["use-one"]);
    expect([...batchTrace.dispatchEventIds]).toEqual(["dispatch-one"]);

    const consumptionTrace = deriveScheduleTrace(model, {
      kind: "consumption",
      eventIds: ["use-one"],
    });
    expect([...consumptionTrace.batchIds].sort()).toEqual([
      "fg::one",
      "input::one",
    ]);
    expect([...consumptionTrace.consumptionEventIds]).toEqual(["use-one"]);

    const deliveryTrace = deriveScheduleTrace(model, {
      kind: "dispatch",
      eventIds: ["dispatch-one"],
    });
    expect([...deliveryTrace.batchIds].sort()).toEqual([
      "fg::one",
      "input::one",
    ]);
    expect([...deliveryTrace.dispatchEventIds]).toEqual(["dispatch-one"]);

    const clusterTrace = deriveScheduleTrace(model, {
      kind: "dispatch",
      eventIds: ["dispatch-one", "dispatch-two"],
    });
    expect([...clusterTrace.batchIds].sort()).toEqual([
      "fg::one",
      "fg::two",
      "input::one",
    ]);
    expect([...clusterTrace.dispatchEventIds].sort()).toEqual([
      "dispatch-one",
      "dispatch-two",
    ]);
  });

  it("builds adjacency from the full artifact before date filtering", () => {
    const rawLegacy = {
      ...batch("raw::one", "2025-01-01", "2025-01-01", [
        directAllocation(10, ["intermediate"]),
      ]),
      material: "raw",
      lifecycle_start: "2025-01-01",
      lifecycle_end: "2025-01-02",
    };
    const inputLegacy = {
      ...schedule.lanes[1]!.batches[0]!,
      lifecycle_start: "2026-01-01",
      lifecycle_end: "2026-01-10",
    };
    const events: ProductionScheduleConsumptionEvent[] = [
      {
        id: "raw-use",
        source_batch_id: "raw::one",
        consuming_order: "make-input",
        consumption_date: "2025-01-02",
        episode_scope: "in_episode",
        net_quantity: 10,
        status: "selected",
        confidence: "exact",
        reason: "direct output",
        direct_consumer_materials: ["intermediate"],
      },
      {
        id: "input-use",
        source_batch_id: "input::one",
        consuming_order: "make-fg::one",
        consumption_date: "2026-01-10",
        episode_scope: "in_episode",
        net_quantity: 10,
        status: "selected",
        confidence: "exact",
        reason: "direct output",
        direct_consumer_materials: ["fg"],
      },
    ];
    const linkedSchedule = v12Schedule({
      events,
      links: [
        {
          id: "raw-to-hidden",
          event_id: "raw-use",
          target_batch_ids: ["input::one"],
        },
        {
          id: "hidden-to-fg",
          event_id: "input-use",
          target_batch_ids: ["fg::one"],
        },
      ],
    });
    linkedSchedule.lanes[1]!.batches = [asV12Batch(inputLegacy, ["input-use"])];
    linkedSchedule.lanes.push({
      material: "raw",
      name: "Raw",
      bom_depth: 2,
      role: "raw_material",
      uom: "KG",
      campaigns: [],
      batches: [asV12Batch(rawLegacy, ["raw-use"])],
    });
    const model = deriveScheduleModel(linkedSchedule, {
      start: "2026-01-11",
      end: "2026-01-15",
    });

    expect(model.lanes.map(({ material }) => material)).toEqual(["fg"]);
    expect(
      [
        ...relatedBatchIds(
          model.downstreamByBatch,
          model.upstreamByBatch,
          "fg::one",
        ),
      ].sort(),
    ).toEqual(["fg::one", "input::one", "raw::one"]);
  });

  it("preserves grouped multi-output links", () => {
    const event: ProductionScheduleConsumptionEvent = {
      id: "grouped-use",
      source_batch_id: "input::one",
      consuming_order: "multi-output",
      consumption_date: "2026-01-02",
      episode_scope: "in_episode",
      net_quantity: 10,
      status: "shared",
      confidence: "candidate",
      reason: "multiple outputs",
      direct_consumer_materials: ["fg"],
    };
    const grouped = v12Schedule({
      events: [event],
      links: [
        {
          id: "grouped-link",
          event_id: event.id,
          target_batch_ids: ["fg::one", "fg::two"],
        },
      ],
    });
    grouped.lanes[0]!.batches.push({
      ...grouped.lanes[0]!.batches[0]!,
      id: "fg::two",
      batch: "two",
    });

    const model = deriveScheduleModel(grouped, { start: null, end: null });

    expect(model.linksByEvent.get(event.id)?.target_batch_ids).toEqual([
      "fg::one",
      "fg::two",
    ]);
    expect(
      [
        ...relatedBatchIds(
          model.downstreamByBatch,
          model.upstreamByBatch,
          "input::one",
        ),
      ].sort(),
    ).toEqual(["fg::one", "fg::two", "input::one"]);
  });

  it("builds v1.1 fallback links from immediate outputs", () => {
    const legacy: ProductionSchedule = {
      ...schedule,
      lanes: schedule.lanes.map((lane) => ({
        ...lane,
        batches: lane.batches.map((item) =>
          item.id === "input::one"
            ? {
                ...item,
                allocations: [
                  {
                    ...directAllocation(10, ["fg"]),
                    event_id: "legacy-use",
                    direct_output_candidates: [
                      {
                        material: "fg",
                        batch: "one",
                        order: "consume-order",
                        output_date: "2026-01-10",
                        quantity: 10,
                      },
                    ],
                  },
                ],
              }
            : item,
        ),
      })),
    };

    const model = deriveScheduleModel(legacy, { start: null, end: null });

    expect(model.linksByEvent.get("legacy-use")?.target_batch_ids).toEqual([
      "fg::one",
    ]);
  });

  it("filters focused lanes and repacks connected batches compactly", () => {
    const batches = [
      batch("connected-a", "2026-01-01", "2026-01-10", []),
      batch("unrelated", "2026-01-01", "2026-01-10", []),
      batch("connected-b", "2026-01-11", "2026-01-12", []),
    ];
    const packedBatches = packBatchTracks(batches);
    const focused = focusScheduleLanes(
      [
        {
          ...schedule.lanes[1]!,
          batches,
          packedBatches,
          trackCount: 2,
        },
        {
          ...schedule.lanes[0]!,
          packedBatches: packBatchTracks(schedule.lanes[0]!.batches),
          trackCount: 1,
        },
      ],
      new Set(["connected-a", "connected-b"]),
      true,
    );

    expect(focused).toHaveLength(1);
    expect(focused[0]?.batches.map(({ id }) => id)).toEqual([
      "connected-a",
      "connected-b",
    ]);
    expect(focused[0]?.packedBatches.map(({ track }) => track)).toEqual([0, 0]);
    expect(focused[0]?.trackCount).toBe(1);
  });

  it("leaves all lane packing untouched when focus is clear", () => {
    const model = deriveScheduleModel(schedule, { start: null, end: null });
    expect(focusScheduleLanes(model.lanes, new Set(), false)).toEqual(
      model.lanes,
    );
  });
});

describe("timeline event geometry", () => {
  it("uses day boundaries for inclusive observation intervals", () => {
    expect(
      intervalPercent("2026-01-01", "2026-01-01", "2026-01-01", "2026-01-01"),
    ).toEqual({ left: 0, right: 100 });
  });

  it("clusters only events within rendered pixel proximity", () => {
    const events = ["2026-01-01", "2026-01-02", "2026-01-20"].map(
      (consumption_date, index) => ({
        id: `event-${index}`,
        consumption_date,
      }),
    );

    expect(
      clusterEventsByPixel(
        events,
        (event) => event.consumption_date,
        "2026-01-01",
        "2026-01-31",
        310,
        20,
      ).map((cluster) => cluster.items.map(({ id }) => id)),
    ).toEqual([["event-0", "event-1"], ["event-2"]]);
  });

  it("requires both open state and positive residual for a tail", () => {
    const legacy = batch("residual", "2026-01-01", "2026-01-02", []);
    const open = asV12Batch(legacy, [], "open");
    expect(hasOpenResidual(open)).toBe(true);
    expect(hasOpenResidual({ ...open, remaining_quantity: 0 })).toBe(false);
    expect(
      hasOpenResidual({
        ...open,
        lifecycle_end_reason: "depleted",
      }),
    ).toBe(false);
    expect(batchLifecycleEnd(open)).toBe("2026-01-02");
  });
});

describe("packBatchTracks", () => {
  it("uses production-only intervals for IM/FG and keeps raw dwell", () => {
    const first = {
      ...asV12Batch(batch("first", "2026-01-01", "2026-01-02", []), [], "open"),
      lifecycle_end: "2026-01-10",
      timing_kind: "production_window" as const,
    };
    const second = {
      ...asV12Batch(
        batch("second", "2026-01-03", "2026-01-04", []),
        [],
        "open",
      ),
      lifecycle_end: "2026-01-10",
      timing_kind: "production_window" as const,
    };

    expect(
      packBatchTracks([first, second], "intermediate", false).map(
        ({ track }) => track,
      ),
    ).toEqual([0, 0]);
    expect(
      packBatchTracks([first, second], "raw_material", false).map(
        ({ track }) => track,
      ),
    ).toEqual([0, 1]);
    expect(
      packBatchTracks([first, second], "intermediate", false, "continuous").map(
        ({ track }) => track,
      ),
    ).toEqual([0, 0]);
  });

  it("reduces lifecycle-only IM/FG evidence to its lifecycle-start day", () => {
    const lifecycleOnly = {
      ...asV12Batch(
        batch("opening", "2026-01-01", "2026-01-02", []),
        [],
        "open",
      ),
      lifecycle_start: "2026-01-05",
      lifecycle_end: "2026-01-10",
      timing_kind: "lifecycle_only" as const,
    };

    expect(batchVisibleRange(lifecycleOnly, "finished_good", false)).toEqual({
      start: "2026-01-05",
      end: "2026-01-05",
    });
    expect(batchVisibleRange(lifecycleOnly, "raw_material", false)).toEqual({
      start: "2026-01-01",
      end: "2026-01-10",
    });
  });

  it("keeps post-depletion evidence in render and packing bounds", () => {
    const first = {
      ...batch("first", "2026-01-01", "2026-01-02", []),
      lifecycle_start: "2026-01-01",
      lifecycle_end: "2026-01-03",
      last_exit_date: "2026-01-06",
    };
    const second = batch("second", "2026-01-05", "2026-01-05", []);

    expect(batchRenderEnd(first)).toBe("2026-01-06");
    expect(packBatchTracks([first, second]).map(({ track }) => track)).toEqual([
      0, 1,
    ]);
  });

  it("packs non-overlapping batches and stacks inclusive overlaps", () => {
    const packed = packBatchTracks([
      batch("a", "2026-01-01", "2026-01-03", []),
      batch("b", "2026-01-03", "2026-01-04", []),
      batch("c", "2026-01-04", "2026-01-05", []),
    ]);

    expect(
      Object.fromEntries(
        packed.map(({ batch: item, track }) => [item.id, track]),
      ),
    ).toEqual({ a: 0, b: 1, c: 0 });
  });

  it("packs using lifecycle windows instead of production windows", () => {
    const first = {
      ...batch("first", "2026-01-01", "2026-01-01", []),
      lifecycle_start: "2026-01-01",
      lifecycle_end: "2026-01-10",
    };
    const second = {
      ...batch("second", "2026-01-05", "2026-01-05", []),
      lifecycle_start: "2026-01-05",
      lifecycle_end: "2026-01-06",
    };

    expect(packBatchTracks([first, second]).map(({ track }) => track)).toEqual([
      0, 1,
    ]);
  });

  it("packs using the union of production and inventory intervals", () => {
    const first = {
      ...batch("first", "2026-01-01", "2026-01-10", []),
      lifecycle_start: "2026-01-05",
      lifecycle_end: "2026-01-06",
    };
    const second = {
      ...batch("second", "2026-01-08", "2026-01-08", []),
      lifecycle_start: "2026-01-08",
      lifecycle_end: "2026-01-08",
    };

    expect(packBatchTracks([first, second]).map(({ track }) => track)).toEqual([
      0, 1,
    ]);
  });
});
