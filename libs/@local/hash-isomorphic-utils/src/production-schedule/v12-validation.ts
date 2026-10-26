import { validateBatchDates } from "./batch-dates.js";
import { isDateInEpisodeScope } from "./episode-scope.js";

import type {
  ProductionScheduleV12,
  ProductionScheduleV12Batch,
} from "./schema.js";
import type { z } from "zod";

type V12Event = ProductionScheduleV12["consumption_events"][number];

const allocationStatuses = [
  "selected",
  "shared",
  "other",
  "unresolved",
] as const;

const exceedsTolerance = (difference: number, tolerance: number): boolean =>
  Math.abs(difference) > tolerance + Number.EPSILON;

const validateLanes = (
  schedule: ProductionScheduleV12,
  context: z.RefinementCtx,
): Map<string, ProductionScheduleV12Batch> => {
  const materialNames = schedule.material_names;
  const batches = new Map<string, ProductionScheduleV12Batch>();
  for (const [laneIndex, lane] of schedule.lanes.entries()) {
    if (materialNames !== undefined && !(lane.material in materialNames)) {
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
  return batches;
};

const validateEventSource = ({
  event,
  source,
  path,
  context,
}: {
  event: V12Event;
  source: ProductionScheduleV12Batch | undefined;
  path: (string | number)[];
  context: z.RefinementCtx;
}): void => {
  if (source === undefined) {
    context.addIssue({
      code: "custom",
      message: "source_batch_id must identify an existing batch",
      path: [...path, "source_batch_id"],
    });
    return;
  }
  const isInScope = isDateInEpisodeScope({
    episodeScope: event.episode_scope,
    date: event.consumption_date,
    batch: source,
  });
  if (!isInScope) {
    context.addIssue({
      code: "custom",
      message:
        "consumption date and episode scope do not match the batch lifecycle",
      path: [...path, "episode_scope"],
    });
  }
};

const validateConsumptionEvents = (
  schedule: ProductionScheduleV12,
  batches: ReadonlyMap<string, ProductionScheduleV12Batch>,
  context: z.RefinementCtx,
): Map<string, V12Event> => {
  const materialNames = schedule.material_names;
  const events = new Map<string, V12Event>();
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
      materialNames !== undefined &&
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
    validateEventSource({
      event,
      source: batches.get(event.source_batch_id),
      path,
      context,
    });
    events.set(event.id, event);
  }
  return events;
};

/**
 * Whether the batch's lifecycle quantities are consistent with its balance status.
 */
const isLifecycleBalanceValid = (
  batch: ProductionScheduleV12Batch,
  tolerance: number,
): boolean => {
  if (batch.lifecycle_balance_status === "balanced") {
    if (batch.quantity === null) {
      return (
        batch.remaining_quantity === 0 &&
        batch.lifecycle_exit_quantity <= tolerance &&
        batch.lifecycle_overage_quantity <= tolerance
      );
    }
    return (
      batch.remaining_quantity !== null &&
      batch.lifecycle_overage_quantity <= tolerance &&
      !exceedsTolerance(
        batch.lifecycle_exit_quantity +
          batch.remaining_quantity -
          batch.quantity,
        tolerance,
      )
    );
  }
  if (batch.lifecycle_balance_status === "over_depleted") {
    return (
      batch.quantity !== null &&
      batch.remaining_quantity === 0 &&
      batch.lifecycle_exit_quantity > batch.quantity &&
      !exceedsTolerance(
        batch.lifecycle_overage_quantity -
          (batch.lifecycle_exit_quantity - batch.quantity),
        tolerance,
      )
    );
  }
  return (
    batch.quantity === null &&
    batch.remaining_quantity === null &&
    batch.lifecycle_overage_quantity <= tolerance
  );
};

const isUnknownOpeningTruthful = (batch: ProductionScheduleV12Batch): boolean =>
  batch.lifecycle_balance_status !== "unknown_opening_balance" ||
  (batch.timing_kind === "lifecycle_only" &&
    batch.derivation === "opening_balance_inference" &&
    batch.start_source === "first_recorded_exit" &&
    batch.finish_source === "last_recorded_exit" &&
    batch.lifecycle_end_reason === "last_evidence" &&
    batch.start === batch.lifecycle_start &&
    batch.end === batch.lifecycle_end &&
    batch.last_exit_date === batch.lifecycle_end);

/**
 * Whether a balanced batch's remaining quantity contradicts whether its lifecycle is still open.
 */
const isRemainingAtOddsWithEnd = (
  batch: ProductionScheduleV12Batch,
  tolerance: number,
): boolean => {
  if (batch.lifecycle_balance_status !== "balanced") {
    return false;
  }
  // A missing remaining quantity compares as zero.
  const remaining = batch.remaining_quantity ?? 0;
  if (batch.lifecycle_end_reason === "open") {
    return remaining <= tolerance;
  }
  return remaining > tolerance;
};

const areBatchAggregatesInconsistent = (
  batch: ProductionScheduleV12Batch,
  batchEvents: readonly V12Event[],
): boolean => {
  const tolerance = batch.allocation_tolerance;
  const allocated = batchEvents.reduce(
    (total, event) => total + event.net_quantity,
    0,
  );
  let expectedUnallocated = batch.unallocated_quantity;
  let expectedOverage = 0;
  if (batch.quantity !== null) {
    expectedUnallocated = Math.max(0, batch.quantity - allocated);
    expectedOverage = Math.max(0, allocated - batch.quantity);
  }

  return (
    exceedsTolerance(allocated - batch.allocated_quantity, tolerance) ||
    exceedsTolerance(
      expectedUnallocated - batch.unallocated_quantity,
      tolerance,
    ) ||
    exceedsTolerance(
      expectedOverage - batch.allocation_overage_quantity,
      tolerance,
    ) ||
    exceedsTolerance(
      batch.allocation_totals.open - batch.unallocated_quantity,
      tolerance,
    ) ||
    !isLifecycleBalanceValid(batch, tolerance) ||
    !isUnknownOpeningTruthful(batch) ||
    isRemainingAtOddsWithEnd(batch, tolerance) ||
    (batch.lifecycle_balance_status === "over_depleted" &&
      batch.lifecycle_end_reason !== "depleted")
  );
};

const validateBatchAllocations = (
  batches: ReadonlyMap<string, ProductionScheduleV12Batch>,
  events: ReadonlyMap<string, V12Event>,
  context: z.RefinementCtx,
): void => {
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
      return event === undefined ? [] : [event];
    });
    for (const status of allocationStatuses) {
      const expected = batchEvents
        .filter((event) => event.status === status)
        .reduce((total, event) => total + event.net_quantity, 0);
      if (
        exceedsTolerance(
          expected - batch.allocation_totals[status],
          batch.allocation_tolerance,
        )
      ) {
        context.addIssue({
          code: "custom",
          message: `${status} allocation total does not match referenced events`,
          path: ["lanes"],
        });
      }
    }
    if (areBatchAggregatesInconsistent(batch, batchEvents)) {
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
};

const areLinkTargetsMismatched = (
  event: V12Event,
  targetBatchIds: readonly string[],
  batches: ReadonlyMap<string, ProductionScheduleV12Batch>,
): boolean =>
  event.consuming_order === null ||
  targetBatchIds.some((targetId) => {
    const target = batches.get(targetId);
    return (
      target === undefined ||
      target.id === event.source_batch_id ||
      !event.direct_consumer_materials.includes(target.material)
    );
  });

const validateBatchLinks = ({
  schedule,
  batches,
  events,
  context,
}: {
  schedule: ProductionScheduleV12;
  batches: ReadonlyMap<string, ProductionScheduleV12Batch>;
  events: ReadonlyMap<string, V12Event>;
  context: z.RefinementCtx;
}): void => {
  const linkIds = new Set<string>();
  const linkedEvents = new Set<string>();
  for (const [linkIndex, link] of schedule.batch_links.entries()) {
    const path = ["batch_links", linkIndex];
    const event = events.get(link.event_id);
    if (
      linkIds.has(link.id) ||
      linkedEvents.has(link.event_id) ||
      event === undefined ||
      new Set(link.target_batch_ids).size !== link.target_batch_ids.length
    ) {
      context.addIssue({
        code: "custom",
        message: "batch link ids, events and targets must be unique and valid",
        path,
      });
    } else {
      if (areLinkTargetsMismatched(event, link.target_batch_ids, batches)) {
        context.addIssue({
          code: "custom",
          message: "batch link targets do not match the consumption event",
          path: [...path, "target_batch_ids"],
        });
      }
      linkIds.add(link.id);
      linkedEvents.add(link.event_id);
    }
  }
};

/**
 * Adds an issue for every inconsistency in a v1.2 schedule apart from its dispatch events.
 *
 * @returns the schedule's batches by id, for validating the dispatch events against.
 */
export const validateV12Schedule = (
  schedule: ProductionScheduleV12,
  context: z.RefinementCtx,
): Map<string, ProductionScheduleV12Batch> => {
  const batches = validateLanes(schedule, context);
  const events = validateConsumptionEvents(schedule, batches, context);
  validateBatchAllocations(batches, events, context);
  validateBatchLinks({ schedule, batches, events, context });
  return batches;
};
