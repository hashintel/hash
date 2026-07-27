import type { ProductionSchedule } from "../../../shared/production-schedule-types";

export type ScheduleRangePreset = "3m" | "6m" | "12m" | "all" | "custom";

export interface ScheduleDateBounds {
  start: string;
  end: string;
}

const legacyConsumptionDates = (
  schedule: Extract<ProductionSchedule, { artifact_version: "1.0" | "1.1" }>,
  relevantBatchIds?: ReadonlySet<string>,
): string[] =>
  schedule.lanes.flatMap((lane) =>
    lane.batches.flatMap((batch) => {
      if (relevantBatchIds && !relevantBatchIds.has(batch.id)) {
        return [];
      }
      return batch.allocations.flatMap((allocation) =>
        allocation.status !== "open" &&
        allocation.consuming_order &&
        allocation.consumption_date
          ? [allocation.consumption_date]
          : [],
      );
    }),
  );

export const productionScheduleArtifactDates = (
  schedule: ProductionSchedule,
  relevantBatchIds?: ReadonlySet<string>,
): string[] => [
  ...schedule.lanes.flatMap((lane) =>
    lane.batches.flatMap((batch) =>
      relevantBatchIds && !relevantBatchIds.has(batch.id)
        ? []
        : [
            batch.start,
            batch.end,
            batch.lifecycle_start ?? batch.start,
            batch.lifecycle_end ?? batch.end,
            ...(batch.last_exit_date ? [batch.last_exit_date] : []),
          ],
    ),
  ),
  ...(schedule.artifact_version === "1.2"
    ? schedule.consumption_events.flatMap((event) =>
        relevantBatchIds && !relevantBatchIds.has(event.source_batch_id)
          ? []
          : [event.consumption_date],
      )
    : legacyConsumptionDates(schedule, relevantBatchIds)),
  ...(schedule.dispatch_events ?? []).flatMap((event) =>
    relevantBatchIds && !relevantBatchIds.has(event.batch_id)
      ? []
      : [
          event.dispatch_date,
          ...event.deliveries.flatMap((delivery) => [
            ...(delivery.departure_date ? [delivery.departure_date] : []),
            ...(delivery.actual_arrival_date
              ? [delivery.actual_arrival_date]
              : []),
            ...(delivery.planned_arrival_date
              ? [delivery.planned_arrival_date]
              : []),
            ...(delivery.arrival_date ? [delivery.arrival_date] : []),
          ]),
        ],
  ),
];

export const productionScheduleDateBounds = (
  schedule: ProductionSchedule,
  relevantBatchIds?: ReadonlySet<string>,
): ScheduleDateBounds | null => {
  const dates = productionScheduleArtifactDates(
    schedule,
    relevantBatchIds,
  ).sort();
  const start = dates[0];
  const end = dates.at(-1);
  return start && end ? { start, end } : null;
};

export const subtractCalendarMonths = (
  isoDate: string,
  months: number,
): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const targetMonthStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1),
  );
  const targetMonthEnd = new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth() + 1,
      0,
    ),
  );
  const clampedDay = Math.min(date.getUTCDate(), targetMonthEnd.getUTCDate());
  targetMonthStart.setUTCDate(clampedDay);
  return targetMonthStart.toISOString().slice(0, 10);
};

export const selectedProductionScheduleRange = ({
  artifactBounds,
  customEnd,
  customStart,
  preset,
}: {
  artifactBounds: ScheduleDateBounds | null;
  customEnd: string;
  customStart: string;
  preset: ScheduleRangePreset;
}): { start: string | null; end: string | null } => {
  if (!artifactBounds || preset === "all") {
    return { start: null, end: null };
  }
  if (preset === "custom") {
    return {
      start: customStart || null,
      end: customEnd || null,
    };
  }
  return {
    start: subtractCalendarMonths(
      artifactBounds.end,
      { "3m": 3, "6m": 6, "12m": 12 }[preset],
    ),
    end: artifactBounds.end,
  };
};
