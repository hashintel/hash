import { computeIqrFences } from "../../shared/outlier-selection/iqr";

import type {
  BatchRow,
  OrderLineRow,
  PipelineOrderMarker,
  PipelineOrderMarkers,
  PipelineSummary,
} from "../../shared/types";

interface MarkerObservation {
  daysBeforeGoodsIssue: number;
}

function positionForLeadDays(
  summary: PipelineSummary,
  leadDays: number,
  measure: "mean" | "median",
  activeSegmentTypes?: ReadonlySet<string>,
): { ratio: number; beforeTrace: boolean } | null {
  const stages = summary.stages.map((stage) => ({
    duration: Math.max(stage[measure], 0),
    active: !activeSegmentTypes || activeSegmentTypes.has(stage.type),
  }));
  const fullTotal = stages.reduce((sum, stage) => sum + stage.duration, 0);
  const visibleTotal = stages.reduce(
    (sum, stage) => sum + (stage.active ? stage.duration : 0),
    0,
  );
  if (fullTotal <= 0 || visibleTotal <= 0) {
    return null;
  }

  const eventElapsed = fullTotal - leadDays;
  const firstVisibleIndex = stages.findIndex((stage) => stage.active);
  const firstVisibleStart = stages
    .slice(0, firstVisibleIndex)
    .reduce((sum, stage) => sum + stage.duration, 0);
  if (eventElapsed <= 0) {
    return { ratio: 0, beforeTrace: true };
  }

  let fullElapsed = 0;
  let visibleElapsed = 0;
  for (const stage of stages) {
    const stageEnd = fullElapsed + stage.duration;
    if (eventElapsed <= stageEnd) {
      if (!stage.active) {
        return {
          ratio: visibleElapsed / visibleTotal,
          beforeTrace: eventElapsed < firstVisibleStart,
        };
      }
      const withinStage = Math.min(
        Math.max(eventElapsed - fullElapsed, 0),
        stage.duration,
      );
      return {
        ratio: (visibleElapsed + withinStage) / visibleTotal,
        beforeTrace: eventElapsed < firstVisibleStart,
      };
    }
    if (stage.active) {
      visibleElapsed += stage.duration;
    }
    fullElapsed = stageEnd;
  }
  return { ratio: 1, beforeTrace: false };
}

function mean(values: number[], excludeOutliers: boolean): number {
  const fences = excludeOutliers ? computeIqrFences(values) : null;
  const meanValues = fences
    ? values.filter(
        (value) => value >= fences.lower && value <= fences.upper,
      )
    : values;
  return (
    meanValues.reduce((sum, value) => sum + value, 0) / meanValues.length
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  const lower = sorted[Math.max(middle - 1, 0)] ?? upper;
  return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;
}

function aggregateMarker(
  observations: MarkerObservation[],
  measure: "mean" | "median",
  summary: PipelineSummary | undefined,
  totalOrderLines: number,
  excludeOutliers: boolean,
  activeSegmentTypes?: ReadonlySet<string>,
): PipelineOrderMarker | null {
  if (!summary) {
    return null;
  }
  const leadDays = observations.map(
    (observation) => observation.daysBeforeGoodsIssue,
  );
  const daysBeforeGoodsIssue =
    measure === "mean"
      ? mean(leadDays, excludeOutliers)
      : median(leadDays);
  const position = positionForLeadDays(
    summary,
    daysBeforeGoodsIssue,
    measure,
    activeSegmentTypes,
  );
  if (!position) {
    return null;
  }
  return {
    positionPct: Math.min(Math.max(position.ratio * 100, 0), 100),
    daysBeforeGoodsIssue,
    n: observations.length,
    routeLabel: summary.label,
    totalOrderLines,
    beforeVisibleCount: observations.filter(
      (observation) =>
        positionForLeadDays(
          summary,
          observation.daysBeforeGoodsIssue,
          measure,
          activeSegmentTypes,
        )?.beforeTrace,
    ).length,
  };
}

/**
 * Locate order creation on each production route's visible timeline.
 *
 * Each sales-order line contributes at most once per route. Marker positions
 * are derived from the aggregate route waterfall, so hidden segments collapse
 * to boundaries without changing the population or lead-time statistic.
 */
export const computeOrderArrivalMarkers = (
  orderLines: OrderLineRow[],
  batches: BatchRow[],
  summaries: Record<string, PipelineSummary>,
  excludeOutliers = false,
  activeSegmentTypes?: ReadonlySet<string>,
): Record<string, PipelineOrderMarkers> => {
  const batchById = new Map(
    batches.map((batch) => [batch.batch.toUpperCase(), batch]),
  );
  const observationsByRoute = new Map<string, MarkerObservation[]>();

  const eligibleLines = orderLines.filter(
    (line): line is OrderLineRow & { total_days: number } =>
      line.total_days != null && line.total_days >= 0 && line.total_days <= 730,
  );
  const totalOrderLines = eligibleLines.length;

  for (const line of eligibleLines) {
    const routes = new Set<string>();
    for (const batchId of line.batches) {
      const batch = batchById.get(batchId.toUpperCase());
      if (!batch?.route) {
        continue;
      }
      if (summaries[batch.route]) {
        routes.add(batch.route);
      }
    }

    for (const route of routes) {
      const routeObservations = observationsByRoute.get(route) ?? [];
      routeObservations.push({
        daysBeforeGoodsIssue: line.total_days,
      });
      observationsByRoute.set(route, routeObservations);
    }
  }

  const result: Record<string, PipelineOrderMarkers> = {};
  for (const [route, observations] of observationsByRoute) {
    const meanMarker = aggregateMarker(
      observations,
      "mean",
      summaries[route],
      totalOrderLines,
      excludeOutliers,
      activeSegmentTypes,
    );
    const medianMarker = aggregateMarker(
      observations,
      "median",
      summaries[route],
      totalOrderLines,
      excludeOutliers,
      activeSegmentTypes,
    );
    if (meanMarker || medianMarker) {
      result[route] = {
        mean: meanMarker ?? undefined,
        median: medianMarker ?? undefined,
      };
    }
  }
  return result;
};
