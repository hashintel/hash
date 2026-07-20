import { segmentStats } from "../../shared/segment-stats";
import { cutoffForRange } from "../../shared/time-range";

import type { TimeRange } from "../../shared/time-range";
import type {
  BatchRow,
  BatchTimelineSegment,
  BatchTimelines,
  CustomerSegmentType,
  FulfilmentSource,
  OrderLineRow,
  OrderSegmentKey,
  PipelineSummary,
} from "../../shared/types";

const ORDER_SEG_DEFS: Array<[OrderSegmentKey, string, CustomerSegmentType]> = [
  [
    "seg_order_to_delivery",
    "Order Created \u2192 Delivery Created",
    "order_wait",
  ],
  [
    "seg_delivery_to_dispatch",
    "Delivery Created \u2192 Goods Issue",
    "fulfilment",
  ],
];

export interface FulfilmentShares {
  n: number;
  fromStockPct: number;
  awaitedProductionPct: number;
  unknownPct: number;
  mtoPeggedPct: number;
}

export interface OrderPrototypeStats {
  fromStockMedianDays: number | null;
  awaitedMedianDays: number | null;
  awaitedProductionWaitMedianDays: number | null;
  stockAgeMedianDays: number | null;
  awaitedAlreadyRunningPct: number | null;
  awaitedNotStartedPct: number | null;
  sharedBatchPct: number | null;
  averageOrderLinesPerBatch: number | null;
  openMedianAgeDays: number | null;
  openAsOf: string | null;
  distinctCustomers: number;
  topCustomerVolumePct: number | null;
}

export interface OrderPipelineResult {
  lines: OrderLineRow[];
  pipeline: Record<string, PipelineSummary>;
  segments: Partial<Record<OrderSegmentKey, BatchTimelineSegment>>;
  shares: FulfilmentShares | null;
  prototypeStats: OrderPrototypeStats | null;
}

export const filterOrderLines = (
  lines: OrderLineRow[],
  timeRange: TimeRange,
): OrderLineRow[] => {
  const cutoff = cutoffForRange(timeRange);
  return lines.filter((line) => line.dispatch_date.slice(0, 7) >= cutoff);
};

function computeFulfilmentShares(
  lines: OrderLineRow[],
): FulfilmentShares | null {
  if (lines.length === 0) {
    return null;
  }
  const counts: Record<FulfilmentSource, number> = {
    from_stock: 0,
    awaited_production: 0,
    unknown: 0,
  };
  let mto = 0;
  for (const line of lines) {
    counts[line.fulfilment] += 1;
    if (line.mto_pegged) {
      mto += 1;
    }
  }
  const percentage = (count: number) => (count / lines.length) * 100;
  return {
    n: lines.length,
    fromStockPct: percentage(counts.from_stock),
    awaitedProductionPct: percentage(counts.awaited_production),
    unknownPct: percentage(counts.unknown),
    mtoPeggedPct: percentage(mto),
  };
}

function computePrototypeStats(
  lines: OrderLineRow[],
  excludeOutliers: boolean,
  batches: BatchRow[],
  openOrderCreatedDates: string[],
  observedAsOf?: string | null,
): OrderPrototypeStats {
  const percentage = (count: number, denominator: number) =>
    denominator > 0 ? (count / denominator) * 100 : null;
  const medianFor = (values: Array<number | null | undefined>) =>
    segmentStats(values, excludeOutliers)?.median ?? null;
  const daysBetween = (
    later: string | null | undefined,
    earlier: string | null | undefined,
  ) => {
    if (!later || !earlier) {
      return null;
    }
    const days = Math.round(
      (Date.parse(later) - Date.parse(earlier)) / 86_400_000,
    );
    return Number.isFinite(days) && days >= 0 ? days : null;
  };

  const fromStock = lines.filter((line) => line.fulfilment === "from_stock");
  const awaited = lines.filter(
    (line) => line.fulfilment === "awaited_production",
  );
  const fromStockMedianDays = medianFor(
    fromStock.map((line) => line.total_days),
  );
  const awaitedMedianDays = medianFor(awaited.map((line) => line.total_days));
  const awaitedProductionWaitMedianDays = medianFor(
    awaited.map((line) =>
      daysBetween(line.batch_available, line.order_created),
    ),
  );
  const stockAgeMedianDays = medianFor(
    fromStock.map((line) =>
      daysBetween(line.order_created, line.batch_available),
    ),
  );

  const batchById = new Map(
    batches.map((batch) => [batch.batch.toUpperCase(), batch]),
  );
  let alreadyRunning = 0;
  let notStarted = 0;
  for (const line of awaited) {
    const waitedBatches = line.batches
      .map((id) => batchById.get(id.toUpperCase()))
      .filter((batch): batch is BatchRow => {
        if (!batch) {
          return false;
        }
        const available = batch.qa_release_date ?? batch.fg_receipt_date;
        return available != null && available > line.order_created;
      });
    const hasKnownStarts =
      waitedBatches.length > 0 &&
      waitedBatches.every((batch) => batch.earliest_production_start != null);
    if (hasKnownStarts) {
      if (
        waitedBatches.some(
          (batch) =>
            batch.earliest_production_start != null &&
            batch.earliest_production_start > line.order_created,
        )
      ) {
        notStarted += 1;
      } else {
        alreadyRunning += 1;
      }
    }
  }

  const ordersByBatch = new Map<string, Set<string>>();
  for (const line of lines) {
    for (const batch of line.batches) {
      const id = batch.toUpperCase();
      const orderLines = ordersByBatch.get(id) ?? new Set<string>();
      orderLines.add(`${line.sales_order}/${line.so_item}`);
      ordersByBatch.set(id, orderLines);
    }
  }
  const batchOrderCounts = [...ordersByBatch.values()].map(
    (orders) => orders.size,
  );
  const sharedBatchPct = percentage(
    batchOrderCounts.filter((count) => count > 1).length,
    batchOrderCounts.length,
  );
  const averageOrderLinesPerBatch =
    batchOrderCounts.length > 0
      ? batchOrderCounts.reduce((sum, count) => sum + count, 0) /
        batchOrderCounts.length
      : null;

  const customerLines = lines.filter(
    (line) => line.customer != null && line.customer !== "",
  );
  const distinctCustomers = new Set(customerLines.map((line) => line.customer))
    .size;
  const customerVolumes = new Map<string, number>();
  for (const line of customerLines) {
    if (
      !line.customer ||
      line.delivered_qty == null ||
      line.delivered_qty <= 0
    ) {
      continue;
    }
    customerVolumes.set(
      line.customer,
      (customerVolumes.get(line.customer) ?? 0) + line.delivered_qty,
    );
  }
  const totalCustomerVolume = [...customerVolumes.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const topCustomerVolumePct =
    totalCustomerVolume > 0
      ? (Math.max(...customerVolumes.values()) / totalCustomerVolume) * 100
      : null;
  const openMedianAgeDays = observedAsOf
    ? medianFor(
        openOrderCreatedDates.map((created) =>
          daysBetween(observedAsOf, created),
        ),
      )
    : null;

  return {
    fromStockMedianDays,
    awaitedMedianDays,
    awaitedProductionWaitMedianDays,
    stockAgeMedianDays,
    awaitedAlreadyRunningPct: percentage(alreadyRunning, awaited.length),
    awaitedNotStartedPct: percentage(notStarted, awaited.length),
    sharedBatchPct,
    averageOrderLinesPerBatch,
    openMedianAgeDays,
    openAsOf: observedAsOf ?? null,
    distinctCustomers,
    topCustomerVolumePct,
  };
}

/**
 * Recompute customer-order timing and prototype statistics from raw order
 * lines under the active time-window and outlier settings.
 */
export const recomputeOrderTimelines = (
  lines: OrderLineRow[],
  timeRange: TimeRange,
  excludeOutliers = false,
  batchTimelines?: BatchTimelines,
  openOrderCreatedDates: string[] = [],
  observedAsOf?: string | null,
): OrderPipelineResult => {
  const filtered = filterOrderLines(lines, timeRange);
  const segments: Partial<Record<OrderSegmentKey, BatchTimelineSegment>> = {};
  const segmentDefinitions: Array<[OrderSegmentKey, string]> = [
    ...ORDER_SEG_DEFS.map(
      ([key, label]) => [key, label] as [OrderSegmentKey, string],
    ),
    ["total_days", "Total (Order \u2192 Goods Issue)"],
  ];
  for (const [key, label] of segmentDefinitions) {
    const segment = segmentStats(
      filtered.map((line) => line[key]),
      excludeOutliers,
    );
    if (segment) {
      segments[key] = { ...segment, label };
    }
  }

  const stages = [];
  let totalMean = 0;
  let totalMedian = 0;
  for (const [key, label, type] of ORDER_SEG_DEFS) {
    const segment = segments[key];
    if (!segment) {
      continue;
    }
    stages.push({
      id: key,
      label,
      type,
      mean: segment.mean,
      median: segment.median,
      p75: segment.p75,
      p95: segment.p95,
      pct_of_total: 0,
      n: segment.n,
    });
    totalMean += segment.mean;
    totalMedian += segment.median;
  }
  if (totalMean > 0) {
    for (const stage of stages) {
      stage.pct_of_total = (stage.mean / totalMean) * 100;
    }
  }
  const pipeline: Record<string, PipelineSummary> =
    stages.length > 0
      ? {
          orders: {
            label: "Customer orders",
            stages,
            total_mean: totalMean,
            total_median: totalMedian,
          },
        }
      : {};

  return {
    lines: filtered,
    pipeline,
    segments,
    shares: computeFulfilmentShares(filtered),
    prototypeStats:
      filtered.length > 0
        ? computePrototypeStats(
            filtered,
            excludeOutliers,
            batchTimelines?.batches ?? [],
            openOrderCreatedDates,
            observedAsOf,
          )
        : null,
  };
};
