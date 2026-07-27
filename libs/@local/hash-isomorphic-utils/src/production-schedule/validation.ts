import { z } from "zod";

import { productionScheduleSchema } from "./schema.js";

import type {
  ProductionSchedule,
  ProductionScheduleDelivery,
  ProductionScheduleDispatchEvent,
  ProductionScheduleV12,
  ProductionScheduleV12Batch,
} from "./schema.js";

const DAY_MS = 86_400_000;

export const inclusiveProductionScheduleSpanDays = (
  start: string,
  end: string,
): number =>
  Math.floor(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      DAY_MS,
  ) + 1;

export const deriveProductionScheduleDeliveryCoverage = ({
  deliveries,
  dispatchQuantity,
  dispatchUom,
  quantityTolerance,
}: {
  deliveries: readonly ProductionScheduleDelivery[];
  dispatchQuantity: number;
  dispatchUom: string | null;
  quantityTolerance: number;
}): ProductionScheduleDispatchEvent["delivery_coverage"] => {
  if (deliveries.length === 0) {
    return "none";
  }
  const comparable =
    dispatchUom !== null &&
    deliveries.every(
      (delivery) =>
        delivery.quantity !== undefined && delivery.uom === dispatchUom,
    );
  if (!comparable) {
    return "uom_incomparable";
  }
  const deliveredQuantity = deliveries.reduce(
    (total, delivery) => total + delivery.quantity!,
    0,
  );
  if (
    Math.abs(deliveredQuantity - dispatchQuantity) <=
    quantityTolerance + Number.EPSILON
  ) {
    return "exact";
  }
  return deliveredQuantity < dispatchQuantity ? "partial" : "over";
};

const validateBatchDates = (
  batch: {
    start: string;
    end: string;
    span_days: number;
  },
  path: (string | number)[],
  context: z.RefinementCtx,
) => {
  if (batch.start > batch.end) {
    context.addIssue({
      code: "custom",
      message: "start must not be after end",
      path: [...path, "start"],
    });
  }
  const expectedSpan = inclusiveProductionScheduleSpanDays(
    batch.start,
    batch.end,
  );
  if (batch.span_days !== expectedSpan) {
    context.addIssue({
      code: "custom",
      message: `span_days must equal the inclusive start/end span (${expectedSpan})`,
      path: [...path, "span_days"],
    });
  }
};

const validateDispatches = (
  schedule: ProductionSchedule,
  batches: ReadonlyMap<string, ProductionScheduleV12Batch>,
  context: z.RefinementCtx,
) => {
  const dispatchIds = new Set<string>();
  const dispatchKeys = new Set<string>();
  for (const [dispatchIndex, dispatch] of (
    schedule.dispatch_events ?? []
  ).entries()) {
    const path = ["dispatch_events", dispatchIndex];
    if (dispatchIds.has(dispatch.id)) {
      context.addIssue({
        code: "custom",
        message: "dispatch id must be unique",
        path: [...path, "id"],
      });
    }
    dispatchIds.add(dispatch.id);

    const deliveryKeys = dispatch.deliveries.map(
      (delivery) => `${delivery.delivery_number}\0${delivery.delivery_item}`,
    );
    if (new Set(deliveryKeys).size !== deliveryKeys.length) {
      context.addIssue({
        code: "custom",
        message: "delivery number/item pairs must be unique per dispatch",
        path: [...path, "deliveries"],
      });
    }
    if (
      dispatch.delivery_coverage !==
      deriveProductionScheduleDeliveryCoverage({
        deliveries: dispatch.deliveries,
        dispatchQuantity: dispatch.quantity,
        dispatchUom: dispatch.uom,
        quantityTolerance: schedule.quantity_tolerance,
      })
    ) {
      context.addIssue({
        code: "custom",
        message: "delivery_coverage does not match the delivery quantities",
        path: [...path, "delivery_coverage"],
      });
    }

    if (schedule.artifact_version !== "1.2") {
      continue;
    }
    const batch = batches.get(dispatch.batch_id);
    if (
      !batch ||
      batch.material !== dispatch.material ||
      batch.batch !== dispatch.batch
    ) {
      context.addIssue({
        code: "custom",
        message: "dispatch must identify an existing matching batch",
        path: [...path, "batch_id"],
      });
      continue;
    }
    const isInScope =
      dispatch.episode_scope === "in_episode"
        ? dispatch.dispatch_date >= batch.lifecycle_start &&
          dispatch.dispatch_date <= batch.lifecycle_end
        : dispatch.episode_scope === "pre_receipt"
          ? batch.lifecycle_balance_status === "unknown_opening_balance" &&
            dispatch.dispatch_date >= batch.lifecycle_start &&
            dispatch.dispatch_date <= batch.lifecycle_end
          : batch.lifecycle_balance_status === "over_depleted" &&
            batch.lifecycle_end_reason === "depleted" &&
            dispatch.dispatch_date > batch.lifecycle_end;
    if (!isInScope) {
      context.addIssue({
        code: "custom",
        message:
          "dispatch date and episode scope do not match the batch lifecycle",
        path: [...path, "episode_scope"],
      });
    }
    const dispatchKey = `${dispatch.material}\0${dispatch.batch}\0${dispatch.dispatch_date}`;
    if (dispatchKeys.has(dispatchKey)) {
      context.addIssue({
        code: "custom",
        message: "only one dispatch is allowed per material, batch and day",
        path,
      });
    }
    dispatchKeys.add(dispatchKey);
  }
};

const validateV12Schedule = (
  schedule: ProductionScheduleV12,
  context: z.RefinementCtx,
) => {
  const materialNames = schedule.material_names;
  const batches = new Map<string, ProductionScheduleV12Batch>();
  for (const [laneIndex, lane] of schedule.lanes.entries()) {
    if (materialNames && !(lane.material in materialNames)) {
      context.addIssue({
        code: "custom",
        message: "lane material must have a material_names entry",
        path: ["lanes", laneIndex, "material"],
      });
    }
    for (const [batchIndex, batch] of lane.batches.entries()) {
      const path = ["lanes", laneIndex, "batches", batchIndex];
      validateBatchDates(batch, path, context);
      if (batches.has(batch.id)) {
        context.addIssue({
          code: "custom",
          message: "batch id must be unique",
          path: [...path, "id"],
        });
      }
      if (batch.material !== lane.material) {
        context.addIssue({
          code: "custom",
          message: "batch material must match its lane",
          path: [...path, "material"],
        });
      }
      if (
        batch.lifecycle_start > batch.lifecycle_end ||
        batch.lifecycle_start < batch.start ||
        batch.end > batch.lifecycle_end
      ) {
        context.addIssue({
          code: "custom",
          message: "production dates must be contained by the lifecycle",
          path: [...path, "lifecycle_start"],
        });
      }
      if (
        batch.last_exit_date !== null &&
        (batch.last_exit_date < batch.lifecycle_start ||
          (batch.last_exit_date > batch.lifecycle_end &&
            batch.lifecycle_balance_status !== "over_depleted"))
      ) {
        context.addIssue({
          code: "custom",
          message: "last_exit_date is outside the permitted lifecycle",
          path: [...path, "last_exit_date"],
        });
      }
      batches.set(batch.id, batch);
    }
  }

  const events = new Map<
    string,
    ProductionScheduleV12["consumption_events"][number]
  >();
  for (const [eventIndex, event] of schedule.consumption_events.entries()) {
    const path = ["consumption_events", eventIndex];
    if (events.has(event.id)) {
      context.addIssue({
        code: "custom",
        message: "event id must be unique",
        path: [...path, "id"],
      });
    }
    if (
      new Set(event.direct_consumer_materials).size !==
      event.direct_consumer_materials.length
    ) {
      context.addIssue({
        code: "custom",
        message: "direct consumer materials must be unique",
        path: [...path, "direct_consumer_materials"],
      });
    }
    if (
      materialNames &&
      event.direct_consumer_materials.some(
        (material) => !(material in materialNames),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "direct consumer material must have a material_names entry",
        path: [...path, "direct_consumer_materials"],
      });
    }
    if (event.consuming_order === null && event.status !== "unresolved") {
      context.addIssue({
        code: "custom",
        message: "events without an order must be unresolved",
        path: [...path, "status"],
      });
    }
    const source = batches.get(event.source_batch_id);
    if (!source) {
      context.addIssue({
        code: "custom",
        message: "source_batch_id must identify an existing batch",
        path: [...path, "source_batch_id"],
      });
    } else {
      const isInScope =
        event.episode_scope === "in_episode"
          ? event.consumption_date >= source.lifecycle_start &&
            event.consumption_date <= source.lifecycle_end
          : event.episode_scope === "pre_receipt"
            ? source.lifecycle_balance_status === "unknown_opening_balance" &&
              event.consumption_date >= source.lifecycle_start &&
              event.consumption_date <= source.lifecycle_end
            : source.lifecycle_balance_status === "over_depleted" &&
              source.lifecycle_end_reason === "depleted" &&
              event.consumption_date > source.lifecycle_end;
      if (!isInScope) {
        context.addIssue({
          code: "custom",
          message:
            "consumption date and episode scope do not match the batch lifecycle",
          path: [...path, "episode_scope"],
        });
      }
    }
    events.set(event.id, event);
  }

  const referencedEvents = new Set<string>();
  for (const [batchId, batch] of batches) {
    for (const eventId of batch.consumption_event_ids) {
      if (
        referencedEvents.has(eventId) ||
        events.get(eventId)?.source_batch_id !== batchId
      ) {
        context.addIssue({
          code: "custom",
          message:
            "consumption event references must be unique and owned by the batch",
          path: ["lanes"],
        });
      }
      referencedEvents.add(eventId);
    }
    const batchEvents = batch.consumption_event_ids.flatMap((eventId) => {
      const event = events.get(eventId);
      return event ? [event] : [];
    });
    const tolerance = batch.allocation_tolerance;
    for (const status of [
      "selected",
      "shared",
      "other",
      "unresolved",
    ] as const) {
      const expected = batchEvents
        .filter((event) => event.status === status)
        .reduce((total, event) => total + event.net_quantity, 0);
      if (
        Math.abs(expected - batch.allocation_totals[status]) >
        tolerance + Number.EPSILON
      ) {
        context.addIssue({
          code: "custom",
          message: `${status} allocation total does not match referenced events`,
          path: ["lanes"],
        });
      }
    }
    const allocated = batchEvents.reduce(
      (total, event) => total + event.net_quantity,
      0,
    );
    const expectedUnallocated =
      batch.quantity === null
        ? batch.unallocated_quantity
        : Math.max(0, batch.quantity - allocated);
    const expectedOverage =
      batch.quantity === null ? 0 : Math.max(0, allocated - batch.quantity);
    const lifecycleIsValid =
      batch.lifecycle_balance_status === "balanced"
        ? batch.quantity === null
          ? batch.remaining_quantity === 0 &&
            batch.lifecycle_exit_quantity <= tolerance &&
            batch.lifecycle_overage_quantity <= tolerance
          : batch.remaining_quantity !== null &&
            batch.lifecycle_overage_quantity <= tolerance &&
            Math.abs(
              batch.lifecycle_exit_quantity +
                batch.remaining_quantity -
                batch.quantity,
            ) <=
              tolerance + Number.EPSILON
        : batch.lifecycle_balance_status === "over_depleted"
          ? batch.quantity !== null &&
            batch.remaining_quantity === 0 &&
            batch.lifecycle_exit_quantity > batch.quantity &&
            Math.abs(
              batch.lifecycle_overage_quantity -
                (batch.lifecycle_exit_quantity - batch.quantity),
            ) <=
              tolerance + Number.EPSILON
          : batch.quantity === null &&
            batch.remaining_quantity === null &&
            batch.lifecycle_overage_quantity <= tolerance;
    const unknownOpeningIsTruthful =
      batch.lifecycle_balance_status !== "unknown_opening_balance" ||
      (batch.timing_kind === "lifecycle_only" &&
        batch.derivation === "opening_balance_inference" &&
        batch.start_source === "first_recorded_exit" &&
        batch.finish_source === "last_recorded_exit" &&
        batch.lifecycle_end_reason === "last_evidence" &&
        batch.start === batch.lifecycle_start &&
        batch.end === batch.lifecycle_end &&
        batch.last_exit_date === batch.lifecycle_end);
    if (
      Math.abs(allocated - batch.allocated_quantity) >
        tolerance + Number.EPSILON ||
      Math.abs(expectedUnallocated - batch.unallocated_quantity) >
        tolerance + Number.EPSILON ||
      Math.abs(expectedOverage - batch.allocation_overage_quantity) >
        tolerance + Number.EPSILON ||
      Math.abs(batch.allocation_totals.open - batch.unallocated_quantity) >
        tolerance + Number.EPSILON ||
      !lifecycleIsValid ||
      !unknownOpeningIsTruthful ||
      (batch.lifecycle_balance_status === "balanced" &&
        (batch.lifecycle_end_reason === "open"
          ? batch.remaining_quantity! <= tolerance
          : batch.remaining_quantity! > tolerance)) ||
      (batch.lifecycle_balance_status === "over_depleted" &&
        batch.lifecycle_end_reason !== "depleted")
    ) {
      context.addIssue({
        code: "custom",
        message: "batch allocation or lifecycle aggregates are inconsistent",
        path: ["lanes"],
      });
    }
  }
  if (referencedEvents.size !== events.size) {
    context.addIssue({
      code: "custom",
      message: "every consumption event must be referenced by one source batch",
      path: ["consumption_events"],
    });
  }

  const linkIds = new Set<string>();
  const linkedEvents = new Set<string>();
  for (const [linkIndex, link] of schedule.batch_links.entries()) {
    const path = ["batch_links", linkIndex];
    const event = events.get(link.event_id);
    if (
      linkIds.has(link.id) ||
      linkedEvents.has(link.event_id) ||
      !event ||
      new Set(link.target_batch_ids).size !== link.target_batch_ids.length
    ) {
      context.addIssue({
        code: "custom",
        message: "batch link ids, events and targets must be unique and valid",
        path,
      });
      continue;
    }
    if (
      event.consuming_order === null ||
      link.target_batch_ids.some((targetId) => {
        const target = batches.get(targetId);
        return (
          !target ||
          target.id === event.source_batch_id ||
          !event.direct_consumer_materials.includes(target.material)
        );
      })
    ) {
      context.addIssue({
        code: "custom",
        message: "batch link targets do not match the consumption event",
        path: [...path, "target_batch_ids"],
      });
    }
    linkIds.add(link.id);
    linkedEvents.add(link.event_id);
  }

  validateDispatches(schedule, batches, context);
};

export const validatedProductionScheduleSchema =
  productionScheduleSchema.superRefine((schedule, context) => {
    if (schedule.artifact_version === "1.2") {
      validateV12Schedule(schedule, context);
      return;
    }
    for (const [laneIndex, lane] of schedule.lanes.entries()) {
      for (const [batchIndex, batch] of lane.batches.entries()) {
        validateBatchDates(
          batch,
          ["lanes", laneIndex, "batches", batchIndex],
          context,
        );
      }
    }
    validateDispatches(schedule, new Map(), context);
  });

export const parseProductionSchedule = (
  value: unknown,
  productId?: string,
): ProductionSchedule => {
  const schedule = validatedProductionScheduleSchema.parse(value);
  if (productId !== undefined && schedule.product_id !== productId) {
    throw new z.ZodError([
      {
        code: "custom",
        message: `product_id must equal ${productId}`,
        path: ["product_id"],
      },
    ]);
  }
  return schedule as ProductionSchedule;
};

export const safeParseProductionSchedule = (
  value: unknown,
  productId?: string,
) => {
  try {
    return {
      success: true as const,
      data: parseProductionSchedule(value, productId),
    };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof z.ZodError
          ? error
          : new z.ZodError([
              {
                code: "custom",
                message: error instanceof Error ? error.message : String(error),
                path: [],
              },
            ]),
    };
  }
};
