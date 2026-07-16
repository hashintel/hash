import type {
  ProductionSchedule,
  ProductionScheduleBatch,
  ProductionScheduleLane,
  ProductionScheduleStatus,
} from "../../../shared/production-schedule-types";

const DAY_MS = 86_400_000;

export interface ScheduleFilters {
  start: string | null;
  end: string | null;
  material: string | null;
  role: ProductionScheduleLane["role"] | "all";
  campaign: string | null;
  status: ProductionScheduleStatus | "all";
  minGapDays: number;
}

export interface ScheduleGap {
  laneMaterial: string;
  start: string;
  end: string;
  days: number;
}

export interface ScheduleKpis {
  campaigns: number;
  batches: number;
  activeDays: number | null;
  medianGapDays: number | null;
  longestGapDays: number | null;
  longestRunDays: number | null;
  selectedQuantity: ScheduleQuantity[];
  sharedQuantity: ScheduleQuantity[];
  openQuantity: ScheduleQuantity[];
}

export interface ScheduleQuantity {
  material: string;
  name: string;
  value: number;
  uom: string | null;
}

export interface ScheduleModel {
  lanes: ProductionScheduleLane[];
  gaps: ScheduleGap[];
  kpis: ScheduleKpis;
  start: string | null;
  end: string | null;
  maxCadence: number;
  maxFillWeight: number;
  lineage: Map<string, "exact" | "candidate">;
}

const dayNumber = (date: string): number =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

const dayString = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

const median = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1]! + sorted[midpoint]!) / 2
    : sorted[midpoint]!;
};

const overlaps = (
  batch: ProductionScheduleBatch,
  start: string | null,
  end: string | null,
): boolean => (!start || batch.end >= start) && (!end || batch.start <= end);

export const campaignKey = ({
  campaign_id,
  campaign_core,
}: {
  campaign_id: string | null;
  campaign_core: string | null;
}): string | null => campaign_id ?? campaign_core;

export const deriveLineage = (
  lanes: ProductionScheduleLane[],
  selectedFinishedGoodBatch: string | null,
): Map<string, "exact" | "candidate"> => {
  const lineage = new Map<string, "exact" | "candidate">();
  if (!selectedFinishedGoodBatch) {
    return lineage;
  }
  for (const lane of lanes) {
    for (const batch of lane.batches) {
      if (
        lane.role === "finished_good" &&
        batch.batch === selectedFinishedGoodBatch
      ) {
        lineage.set(batch.id, "exact");
        continue;
      }
      for (const allocation of batch.allocations) {
        if (
          allocation.output_candidates.some(
            (candidate) =>
              candidate.product_relation === "selected" &&
              candidate.batch === selectedFinishedGoodBatch,
          )
        ) {
          const next =
            allocation.confidence === "exact" ? "exact" : "candidate";
          if (lineage.get(batch.id) !== "exact") {
            lineage.set(batch.id, next);
          }
        }
      }
    }
  }
  return lineage;
};

export const deriveScheduleModel = (
  schedule: ProductionSchedule,
  filters: ScheduleFilters,
  selectedFinishedGoodBatch: string | null,
): ScheduleModel => {
  const baseLanes = schedule.lanes
    .filter(
      (lane) =>
        (filters.role === "all" || lane.role === filters.role) &&
        (!filters.material || lane.material === filters.material),
    )
    .map((lane) => {
      const batches = lane.batches.filter(
        (batch) =>
          overlaps(batch, filters.start, filters.end) &&
          (!filters.campaign || campaignKey(batch) === filters.campaign),
      );
      const campaigns = lane.campaigns.filter((campaign) => {
        if (filters.campaign && campaignKey(campaign) !== filters.campaign) {
          return false;
        }
        const hasPointInRange = [
          ...campaign.daily_batch_counts,
          ...campaign.daily_fill_weights,
        ].some(
          (point) =>
            (!filters.start || point.date >= filters.start) &&
            (!filters.end || point.date <= filters.end),
        );
        const hasBatchInRange = batches.some(
          (batch) => campaignKey(batch) === campaignKey(campaign),
        );
        return hasPointInRange || hasBatchInRange;
      });
      return { ...lane, batches, campaigns };
    });

  const lanes = baseLanes
    .map((lane) => ({
      ...lane,
      batches: lane.batches.filter(
        (batch) =>
          filters.status === "all" ||
          batch.allocation_totals[filters.status] > 0,
      ),
    }))
    .filter(
      (lane) =>
        lane.batches.length > 0 ||
        (filters.status === "all" && lane.campaigns.length > 0),
    )
    .sort(
      (left, right) =>
        right.bom_depth - left.bom_depth ||
        left.material.localeCompare(right.material),
    );

  const allBatches = lanes.flatMap((lane) => lane.batches);
  const batchCadence = lanes.flatMap((lane) =>
    lane.campaigns.flatMap((campaign) =>
      campaign.daily_batch_counts.filter(
        (point) =>
          (!filters.start || point.date >= filters.start) &&
          (!filters.end || point.date <= filters.end),
      ),
    ),
  );
  const fillCadence = lanes.flatMap((lane) =>
    lane.campaigns.flatMap((campaign) =>
      campaign.daily_fill_weights.filter(
        (point) =>
          (!filters.start || point.date >= filters.start) &&
          (!filters.end || point.date <= filters.end),
      ),
    ),
  );
  const allDates = [
    ...allBatches.flatMap((batch) => [batch.start, batch.end]),
    ...batchCadence.map((point) => point.date),
    ...fillCadence.map((point) => point.date),
  ];
  // Only cadence points prove recorded production activity. Batch windows are
  // elapsed intervals and can include quiet days, so counting every day inside
  // a window would overstate actual activity.
  const activeDays = new Set<number>();
  for (const point of [...batchCadence, ...fillCadence]) {
    if (point.value > 0) {
      activeDays.add(dayNumber(point.date));
    }
  }

  const gaps: ScheduleGap[] = [];
  const displayedMaterials = new Set(lanes.map((lane) => lane.material));
  for (const lane of baseLanes) {
    if (!displayedMaterials.has(lane.material)) {
      continue;
    }
    const batches = [...lane.batches].sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    let coveredThrough = batches[0]?.end;
    for (let index = 1; index < batches.length; index++) {
      const next = batches[index]!;
      if (!coveredThrough) {
        coveredThrough = next.end;
        continue;
      }
      const days = dayNumber(next.start) - dayNumber(coveredThrough) - 1;
      if (days >= filters.minGapDays) {
        gaps.push({
          laneMaterial: lane.material,
          start: dayString(dayNumber(coveredThrough) + 1),
          end: dayString(dayNumber(next.start) - 1),
          days,
        });
      }
      if (next.end > coveredThrough) {
        coveredThrough = next.end;
      }
    }
  }

  const sortedActive = [...activeDays].sort((a, b) => a - b);
  let longestRunDays = sortedActive.length > 0 ? 1 : null;
  let currentRun = longestRunDays;
  for (let index = 1; index < sortedActive.length; index++) {
    currentRun =
      sortedActive[index] === sortedActive[index - 1]! + 1
        ? (currentRun ?? 0) + 1
        : 1;
    longestRunDays = Math.max(longestRunDays ?? 0, currentRun);
  }

  const quantities = (
    status: "selected" | "shared" | "open",
  ): ScheduleQuantity[] =>
    lanes
      .map((lane) => ({
        material: lane.material,
        name: lane.name,
        uom: lane.uom,
        value: lane.batches.reduce(
          (sum, batch) => sum + batch.allocation_totals[status],
          0,
        ),
      }))
      .filter(({ value }) => value > 0);

  return {
    lanes,
    gaps,
    kpis: {
      campaigns: new Set(
        [
          ...allBatches.map((batch) => campaignKey(batch)),
          ...(filters.status === "all"
            ? lanes.flatMap((lane) =>
                lane.campaigns.map((campaign) => campaignKey(campaign)),
              )
            : []),
        ].filter((value): value is string => Boolean(value)),
      ).size,
      batches: allBatches.length,
      activeDays: activeDays.size > 0 ? activeDays.size : null,
      medianGapDays: median(gaps.map((gap) => gap.days)),
      longestGapDays:
        gaps.length > 0 ? Math.max(...gaps.map((gap) => gap.days)) : null,
      longestRunDays,
      selectedQuantity: quantities("selected"),
      sharedQuantity: quantities("shared"),
      openQuantity: quantities("open"),
    },
    start:
      filters.start ??
      (allDates.length > 0
        ? allDates.reduce((min, date) => (date < min ? date : min))
        : null),
    end:
      filters.end ??
      (allDates.length > 0
        ? allDates.reduce((max, date) => (date > max ? date : max))
        : null),
    maxCadence: batchCadence.reduce(
      (max, point) => Math.max(max, point.value),
      0,
    ),
    maxFillWeight: fillCadence.reduce(
      (max, point) => Math.max(max, point.value),
      0,
    ),
    lineage: deriveLineage(lanes, selectedFinishedGoodBatch),
  };
};
