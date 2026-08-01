import {
  batchLifecycleStart,
  productionScheduleRelevantBatchIds,
  scheduleDayNumber,
  type ScheduleSelection,
} from "./model";

import type {
  ProductionSchedule,
  ProductionScheduleBatch,
  ProductionScheduleDispatchEvent,
  ProductionScheduleRole,
} from "../../../shared/production-schedule-types";

export type ScheduleIdentifierType =
  | "batch"
  | "production_order"
  | "dispatch"
  | "delivery"
  | "shipment"
  | "sales_order";

export interface ScheduleIdentifierMatch {
  date: string;
  identifierType: ScheduleIdentifierType;
  laneRole: ProductionScheduleRole;
  selection: ScheduleSelection;
}

export const normalizeScheduleIdentifier = (identifier: string): string => {
  const normalized = identifier.trim().toLowerCase();
  if (/^\d+$/.test(normalized)) {
    return normalized.replace(/^0+(?=\d)/, "");
  }
  return normalized;
};

const batchDate = (batch: ProductionScheduleBatch): string => {
  const startDate =
    batch.timing_kind === "lifecycle_only"
      ? batchLifecycleStart(batch)
      : batch.start;
  const endDate =
    batch.timing_kind === "lifecycle_only" ? startDate : batch.end;
  const start = scheduleDayNumber(startDate);
  const end = scheduleDayNumber(endDate);
  return new Date((start + Math.floor((end - start) / 2)) * 86_400_000)
    .toISOString()
    .slice(0, 10);
};

const matchingDispatches = (
  schedule: ProductionSchedule,
  query: string,
  relevantBatchIds: ReadonlySet<string>,
): {
  dispatches: ProductionScheduleDispatchEvent[];
  identifierType: ScheduleIdentifierType;
} | null => {
  const candidates: Array<{
    dispatch: ProductionScheduleDispatchEvent;
    identifierType: ScheduleIdentifierType;
  }> = [];
  for (const dispatch of schedule.dispatch_events ?? []) {
    if (!relevantBatchIds.has(dispatch.batch_id)) {
      continue;
    }
    if (normalizeScheduleIdentifier(dispatch.id) === query) {
      candidates.push({ dispatch, identifierType: "dispatch" });
    }
    for (const delivery of dispatch.deliveries) {
      const identifiers: Array<
        [string | null | undefined, ScheduleIdentifierType]
      > = [
        [delivery.delivery_number, "delivery"],
        [delivery.shipment_number, "shipment"],
        [delivery.sales_order, "sales_order"],
      ];
      for (const [identifier, identifierType] of identifiers) {
        if (identifier && normalizeScheduleIdentifier(identifier) === query) {
          candidates.push({ dispatch, identifierType });
        }
      }
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  const identifierType = candidates[0]!.identifierType;
  return {
    dispatches: [
      ...new Map(
        candidates
          .filter((candidate) => candidate.identifierType === identifierType)
          .map(({ dispatch }) => [dispatch.id, dispatch]),
      ).values(),
    ].sort((left, right) => left.id.localeCompare(right.id)),
    identifierType,
  };
};

export const findScheduleIdentifierMatch = (
  schedule: ProductionSchedule,
  identifier: string,
): ScheduleIdentifierMatch | null => {
  const query = normalizeScheduleIdentifier(identifier);
  if (!query) {
    return null;
  }

  const relevantBatchIds = productionScheduleRelevantBatchIds(schedule);
  const batchCandidates: Array<{
    batch: ProductionScheduleBatch;
    identifierType: "batch" | "production_order";
    laneRole: ProductionScheduleRole;
  }> = [];
  for (const lane of schedule.lanes) {
    for (const batch of lane.batches) {
      if (!relevantBatchIds.has(batch.id)) {
        continue;
      }
      const batchMatches = [batch.batch, batch.id].some(
        (value) => value && normalizeScheduleIdentifier(value) === query,
      );
      if (batchMatches) {
        batchCandidates.push({
          batch,
          identifierType: "batch",
          laneRole: lane.role,
        });
      } else if (
        batch.order &&
        normalizeScheduleIdentifier(batch.order) === query
      ) {
        batchCandidates.push({
          batch,
          identifierType: "production_order",
          laneRole: lane.role,
        });
      }
    }
  }
  const batchMatch = batchCandidates.sort((left, right) =>
    left.batch.id.localeCompare(right.batch.id),
  )[0];
  if (batchMatch) {
    return {
      date: batchDate(batchMatch.batch),
      identifierType: batchMatch.identifierType,
      laneRole: batchMatch.laneRole,
      selection: { kind: "batch", batchId: batchMatch.batch.id },
    };
  }

  const dispatchMatch = matchingDispatches(schedule, query, relevantBatchIds);
  const firstDispatch = dispatchMatch?.dispatches[0];
  if (!dispatchMatch || !firstDispatch) {
    return null;
  }
  const laneRole =
    schedule.lanes.find((lane) =>
      lane.batches.some((batch) => batch.id === firstDispatch.batch_id),
    )?.role ?? "finished_good";
  return {
    date: firstDispatch.dispatch_date,
    identifierType: dispatchMatch.identifierType,
    laneRole,
    selection: {
      kind: "dispatch",
      eventIds: dispatchMatch.dispatches.map((dispatch) => dispatch.id),
      origin: dispatchMatch.dispatches.every(
        (dispatch) => dispatch.material === schedule.product_material,
      )
        ? "dispatch_lane"
        : "batch_marker",
    },
  };
};
