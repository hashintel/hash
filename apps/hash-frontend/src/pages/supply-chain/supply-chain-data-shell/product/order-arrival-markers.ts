import { computeIqrFences } from "../../shared/outlier-selection/iqr";

import type {
  BatchRow,
  OrderLineRow,
  PipelineOrderMarker,
  PipelineOrderMarkers,
  PipelineSummary,
} from "../../shared/types";

interface MarkerObservation {
  daysBeforeRouteEndpoint: number;
}

function positionForLeadDays(
  summary: PipelineSummary,
  leadDays: number,
  measure: "mean" | "median",
  activeSegmentTypes?: ReadonlySet<string>,
): { ratio: number; beforeTrace: boolean; afterTrace: boolean } | null {
  const stages = summary.stages.map((stage) => {
    const rawDuration: unknown = stage[measure];
    const duration =
      typeof rawDuration === "number" && Number.isFinite(rawDuration)
        ? Math.max(rawDuration, 0)
        : 0;
    return {
      duration,
      visible: !activeSegmentTypes || activeSegmentTypes.has(stage.type),
    };
  });
  const fullTotal = stages.reduce((total, stage) => total + stage.duration, 0);
  const visibleTotal = stages.reduce(
    (total, stage) => total + (stage.visible ? stage.duration : 0),
    0,
  );
  if (visibleTotal <= 0) {
    return null;
  }

  const eventElapsed = fullTotal - leadDays;
  const firstVisibleStage = stages.findIndex((stage) => stage.visible);
  const visibleStart = stages
    .slice(0, firstVisibleStage)
    .reduce((total, stage) => total + stage.duration, 0);
  if (eventElapsed < visibleStart) {
    return { ratio: 0, beforeTrace: true, afterTrace: false };
  }
  if (eventElapsed >= fullTotal) {
    return { ratio: 1, beforeTrace: false, afterTrace: true };
  }

  // Locate the event on the complete cumulative timeline, then collapse hidden
  // stages. An event inside a hidden stage lands on that stage's left boundary;
  // an event at its end lands on the right boundary.
  let fullElapsed = 0;
  let visibleElapsed = 0;
  for (const stage of stages) {
    const stageEnd = fullElapsed + stage.duration;
    if (eventElapsed >= stageEnd) {
      if (stage.visible) {
        visibleElapsed += stage.duration;
      }
      fullElapsed = stageEnd;
      continue;
    }
    if (eventElapsed > fullElapsed && stage.visible) {
      visibleElapsed += eventElapsed - fullElapsed;
    }
    break;
  }

  return {
    ratio: visibleElapsed / visibleTotal,
    beforeTrace: false,
    afterTrace: false,
  };
}

function mean(values: number[], excludeOutliers: boolean): number {
  const fences = excludeOutliers ? computeIqrFences(values) : null;
  const meanValues = fences
    ? values.filter((value) => value >= fences.lower && value <= fences.upper)
    : values;
  return meanValues.reduce((sum, value) => sum + value, 0) / meanValues.length;
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
    (observation) => observation.daysBeforeRouteEndpoint,
  );
  const daysBeforeRouteEndpoint =
    measure === "mean" ? mean(leadDays, excludeOutliers) : median(leadDays);
  const position = positionForLeadDays(
    summary,
    daysBeforeRouteEndpoint,
    measure,
    activeSegmentTypes,
  );
  if (!position) {
    return null;
  }
  return {
    positionPct: Math.min(Math.max(position.ratio * 100, 0), 100),
    daysBeforeRouteEndpoint,
    n: observations.length,
    routeLabel: summary.label,
    totalOrderLines,
    beforeVisibleCount: observations.filter(
      (observation) =>
        positionForLeadDays(
          summary,
          observation.daysBeforeRouteEndpoint,
          measure,
          activeSegmentTypes,
        )?.beforeTrace,
    ).length,
    beforeTrace: position.beforeTrace,
    afterTrace: position.afterTrace,
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

  const contributingLines = new Set<OrderLineRow>();

  for (const line of orderLines) {
    if ("route" in line) {
      const route = line.route;
      const endpointDate = line.route_endpoint_date;
      if (!route || !endpointDate || !summaries[route]) {
        continue;
      }
      const daysBeforeRouteEndpoint = Math.round(
        (Date.parse(endpointDate) - Date.parse(line.order_created)) /
          86_400_000,
      );
      if (
        !Number.isFinite(daysBeforeRouteEndpoint) ||
        Math.abs(daysBeforeRouteEndpoint) > 730
      ) {
        continue;
      }
      const routeObservations = observationsByRoute.get(route) ?? [];
      routeObservations.push({ daysBeforeRouteEndpoint });
      observationsByRoute.set(route, routeObservations);
      contributingLines.add(line);
      continue;
    }

    // Compatibility for datasets generated before delivery-specific routes and
    // route endpoints were emitted.
    const batchesByRoute = new Map<string, BatchRow[]>();
    for (const batchId of line.batches) {
      const batch = batchById.get(batchId.toUpperCase());
      if (!batch?.route || !batch.delivery_date || !summaries[batch.route]) {
        continue;
      }
      const routeBatches = batchesByRoute.get(batch.route) ?? [];
      routeBatches.push(batch);
      batchesByRoute.set(batch.route, routeBatches);
    }

    for (const [route, routeBatches] of batchesByRoute) {
      const endpointDate = routeBatches
        .map((batch) => batch.delivery_date)
        .filter((date): date is string => date != null)
        .sort()
        .at(-1);
      if (!endpointDate) {
        continue;
      }
      const daysBeforeRouteEndpoint = Math.round(
        (Date.parse(endpointDate) - Date.parse(line.order_created)) /
          86_400_000,
      );
      if (
        !Number.isFinite(daysBeforeRouteEndpoint) ||
        Math.abs(daysBeforeRouteEndpoint) > 730
      ) {
        continue;
      }
      const routeObservations = observationsByRoute.get(route) ?? [];
      routeObservations.push({
        daysBeforeRouteEndpoint,
      });
      observationsByRoute.set(route, routeObservations);
      contributingLines.add(line);
    }
  }
  const totalOrderLines = contributingLines.size;

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
