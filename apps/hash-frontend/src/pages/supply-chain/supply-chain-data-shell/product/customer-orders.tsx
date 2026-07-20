import { useMemo, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { formatNumber } from "../../shared/cost";
import { StatChip } from "../../shared/stat-chip";
import { timeRangeLongLabel } from "../../shared/time-range";
import { Tooltip } from "../../shared/tooltip";
import { BatchLookup } from "./batch-lookup";
import { recomputeOrderTimelines } from "./recompute-order-timelines";
import { PipelineWaterfall } from "./shared/pipeline-waterfall";

import type { TimeRange } from "../../shared/time-range";
import type { BatchTimelines, OrderTimelines } from "../../shared/types";

const stack = css({ display: "flex", flexDirection: "column", gap: "4" });
const headerRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "2",
});
const titleGroup = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
});
const title = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.heading",
});
const coverageText = css({ textStyle: "xs", color: "fg.subtle" });
const chipsRow = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  rowGap: "1",
});
const emptyNote = css({ textStyle: "sm", color: "fg.subtle" });
const statsSection = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const statsHeading = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
});
const statsGrid = css({
  display: "grid",
  gridTemplateColumns: "[repeat(auto-fit,minmax(145px,1fr))]",
  gap: "2",
});
const statCard = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.5",
  minW: "0",
  px: "3",
  py: "2",
  bg: "bg.subtle",
  borderWidth: "1px",
  borderColor: "bd.subtle",
  borderRadius: "md",
  cursor: "help",
});
const statCardValue = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.max",
  fontVariantNumeric: "tabular-nums",
});
const statCardLabel = css({
  textStyle: "xxs",
  color: "fg.subtle",
  lineHeight: "tight",
});
const lookupDivider = css({
  borderTopWidth: "1px",
  borderColor: "bd.subtle",
  pt: "3",
});

interface CustomerOrdersPanelProps {
  orderTimelines: OrderTimelines;
  batchTimelines?: BatchTimelines;
  timeRange: TimeRange;
  excludeOutliers: boolean;
}

export const CustomerOrdersPanel = ({
  orderTimelines,
  batchTimelines,
  timeRange,
  excludeOutliers,
}: CustomerOrdersPanelProps) => {
  // Customer orders are supporting detail; keep the section compact until a
  // user explicitly opens it.
  const [collapsed, setCollapsed] = useState(true);
  const result = useMemo(
    () =>
      recomputeOrderTimelines(
        orderTimelines.lines,
        timeRange,
        excludeOutliers,
        batchTimelines,
        orderTimelines.open_order_created_dates,
        orderTimelines.observed_as_of,
      ),
    [
      orderTimelines.lines,
      orderTimelines.open_order_created_dates,
      orderTimelines.observed_as_of,
      batchTimelines,
      timeRange,
      excludeOutliers,
    ],
  );

  const shares = result.shares;
  const rangeLabel = timeRangeLongLabel(timeRange).toLowerCase();
  const openLines = orderTimelines.open_lines ?? 0;
  const openSuffix =
    openLines > 0
      ? ` \u00b7 ${formatNumber(openLines)} open ${
          openLines === 1 ? "line" : "lines"
        } excluded (no goods issue yet)`
      : "";
  const coverageLabel =
    (shares
      ? `${formatNumber(shares.n)} delivered order lines \u00b7 ${rangeLabel}`
      : `no delivered order lines \u00b7 ${rangeLabel}`) + openSuffix;
  const formatPercent = (value: number) =>
    `${formatNumber(value, { maximumFractionDigits: 0 })}%`;
  const formatDays = (value: number) =>
    `${formatNumber(value, { maximumFractionDigits: 0 })}d`;
  const formatDecimal = (value: number) =>
    formatNumber(value, { maximumFractionDigits: 1 });
  const prototypeStats = result.prototypeStats;
  const prototypeCards = prototypeStats
    ? [
        {
          label: "Median when covered by stock",
          value: prototypeStats.fromStockMedianDays,
          format: formatDays,
          help: "Median order-to-goods-issue time when the delivered batch was already available at order creation.",
        },
        {
          label: "Median when waiting for production",
          value: prototypeStats.awaitedMedianDays,
          format: formatDays,
          help: "Median order-to-goods-issue time when at least one delivered batch became available after the order.",
        },
        {
          label: "Wait for batch availability",
          value: prototypeStats.awaitedProductionWaitMedianDays,
          format: formatDays,
          help: "For orders that waited, median days from order creation until the delivered batch became available.",
        },
        {
          label: "Stock age when ordered",
          value: prototypeStats.stockAgeMedianDays,
          format: formatDays,
          help: "For stock-covered orders, median days the delivered batch had already been available when the order arrived.",
        },
        {
          label: "Production already running",
          value: prototypeStats.awaitedAlreadyRunningPct,
          format: formatPercent,
          help: "Share of production-waiting lines where all still-needed batches had already started. This suggests MTS backlog, not that the order triggered production.",
        },
        {
          label: "Production not yet started",
          value: prototypeStats.awaitedNotStartedPct,
          format: formatPercent,
          help: "Share of production-waiting lines where at least one still-needed batch started after the order. This is not proof of make-to-order.",
        },
        {
          label: "Batches shared across orders",
          value: prototypeStats.sharedBatchPct,
          format: formatPercent,
          help: "Share of delivered batches used on more than one sales-order line in the active window.",
        },
        {
          label: "Order lines per batch",
          value: prototypeStats.averageOrderLinesPerBatch,
          format: formatDecimal,
          help: "Average number of delivered sales-order lines served by each batch in the active window.",
        },
        {
          label: "Median age of open orders",
          value: prototypeStats.openMedianAgeDays,
          format: formatDays,
          help: `Age of non-rejected lines with no goods issue, measured as of ${
            prototypeStats.openAsOf ?? "the latest extract date"
          }. This is dataset-wide.`,
        },
        {
          label: "Distinct customers",
          value: prototypeStats.distinctCustomers,
          format: (value: number) => formatNumber(value),
          help: "Distinct named customers represented by delivered order lines in the active window.",
        },
        {
          label: "Top customer share of volume",
          value: prototypeStats.topCustomerVolumePct,
          format: formatPercent,
          help: "Largest customer's share of delivered quantity among lines with known customer and quantity.",
        },
      ].filter((card) => card.value != null)
    : [];

  return (
    <div className={stack}>
      <div className={headerRow}>
        <div className={titleGroup}>
          <h3 className={title}>Customer Orders</h3>
          <span className={coverageText}>{coverageLabel}</span>
        </div>
        <Button
          variant="subtle"
          tone="neutral"
          size="xs"
          iconName={collapsed ? "chevronDown" : "chevronUp"}
          onClick={() => setCollapsed((current) => !current)}
          aria-label={
            collapsed ? "Expand customer orders" : "Collapse customer orders"
          }
        />
      </div>

      {!collapsed &&
        (shares == null ? (
          <span className={emptyNote}>
            No delivered customer-order lines in this window.
          </span>
        ) : (
          <>
            <div className={chipsRow}>
              <StatChip
                value={formatPercent(shares.fromStockPct)}
                label="from stock"
              />
              <StatChip
                value={formatPercent(shares.awaitedProductionPct)}
                label="awaited production"
                isHighlight={shares.awaitedProductionPct > 50}
              />
              {shares.unknownPct > 0 && (
                <StatChip
                  value={formatPercent(shares.unknownPct)}
                  label="unknown batch origin"
                />
              )}
              <Tooltip
                content={
                  shares.mtoPeggedPct === 0
                    ? "No production orders in this extract are linked to a sales order (SAP make-to-stock)"
                    : "Share of orders whose production was linked to the sales order in SAP (make-to-order)"
                }
              >
                <StatChip
                  value={formatPercent(shares.mtoPeggedPct)}
                  label="MTO-pegged"
                />
              </Tooltip>
            </div>

            <PipelineWaterfall
              summaries={result.pipeline}
              activeRoute="orders"
              showPercentileRows
            />

            {prototypeCards.length > 0 && (
              <div className={statsSection}>
                <span className={statsHeading}>
                  Prototype statistics — hover for definitions
                </span>
                <div className={statsGrid}>
                  {prototypeCards.map((card) => (
                    <Tooltip
                      key={card.label}
                      content={card.help}
                      wrapperClassName={statCard}
                    >
                      <span className={statCardValue}>
                        {card.format(card.value ?? 0)}
                      </span>
                      <span className={statCardLabel}>{card.label}</span>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}

            <div className={lookupDivider}>
              <BatchLookup
                batchTimelines={batchTimelines}
                orderLines={orderTimelines.lines}
              />
            </div>
          </>
        ))}
    </div>
  );
};
