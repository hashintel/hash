import { useEffect, useMemo, useState } from "react";

import { Button, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { formatNumber } from "../../shared/cost";
import { shortPlantLabel } from "../../shared/plant-label";
import { useRegistry } from "../../shared/registry-context";
import { StatChip } from "../../shared/stat-chip";
import { timeRangeLongLabel } from "../../shared/time-range";
import { OrderLookup } from "./order-lookup";
import { recomputeOrderTimelines } from "./recompute-order-timelines";
import { PipelineWaterfall } from "./shared/pipeline-waterfall";

import type { TimeRange } from "../../shared/time-range";
import type {
  BatchTimelines,
  OrderTimelines,
  PipelineSummary,
} from "../../shared/types";

function orderQtyUnit(orderTimelines: OrderTimelines): string | null {
  return (
    orderTimelines.detail_columns?.find(
      (column) => column.key === "delivered_qty",
    )?.unit ?? null
  );
}

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
  columnGap: "3",
  rowGap: "2",
});
const statsSection = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const statsGrid = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "2",
});
const statCard = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.5",
  w: "[fit-content]",
  minW: "[145px]",
  maxW: "[240px]",
  flex: "[0 1 auto]",
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
const tooltipContent = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
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
  /** Destination route from the E2E pipeline picker; scopes dispatched lines. */
  activeRoute?: string;
  pipelineSummaries?: Record<string, PipelineSummary>;
  onExpandedChange?: (expanded: boolean) => void;
}

export const CustomerOrdersPanel = ({
  orderTimelines,
  batchTimelines,
  timeRange,
  excludeOutliers,
  activeRoute,
  pipelineSummaries,
  onExpandedChange,
}: CustomerOrdersPanelProps) => {
  const { sites } = useRegistry();
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
        activeRoute,
        orderTimelines.open_lines,
      ),
    [
      orderTimelines.lines,
      orderTimelines.open_order_created_dates,
      orderTimelines.observed_as_of,
      orderTimelines.open_lines,
      batchTimelines,
      timeRange,
      excludeOutliers,
      activeRoute,
    ],
  );

  const destinationName = (key: string): string => {
    const named = sites.find((step) => step.slug === key)?.name;
    if (named) {
      return named;
    }
    const label = pipelineSummaries?.[key]?.label;
    if (label && label.toLowerCase() !== key.toLowerCase()) {
      return shortPlantLabel(key, label);
    }
    return key.toUpperCase();
  };
  const routeScopeLabel =
    activeRoute &&
    pipelineSummaries &&
    Object.keys(pipelineSummaries).length > 1
      ? activeRoute === "direct"
        ? "direct to customer"
        : `via ${destinationName(activeRoute)}`
      : null;

  const shares = result.shares;
  const statistics = result.statistics;
  const hasStatistics = statistics != null;
  const rangeLabel = timeRangeLongLabel(timeRange).toLowerCase();
  const openOrderCount =
    statistics?.openOrderCount ?? orderTimelines.open_lines ?? 0;

  useEffect(() => {
    if (!hasStatistics && !collapsed) {
      setCollapsed(true);
      onExpandedChange?.(false);
    }
  }, [collapsed, hasStatistics, onExpandedChange]);

  const coverageLabel = shares
    ? `${formatNumber(shares.n)} dispatched order lines${
        routeScopeLabel ? ` ${routeScopeLabel}` : ""
      } · ${formatNumber(openOrderCount)} total open order lines \u00b7 ${rangeLabel}`
    : `no dispatched order lines ${
        routeScopeLabel ? `  ${routeScopeLabel}` : ""
      } · ${formatNumber(openOrderCount)} total open order lines \u00b7 ${rangeLabel}`;
  const formatPercent = (value: number) =>
    `${formatNumber(value, { maximumFractionDigits: 0 })}%`;
  const formatDays = (value: number) =>
    `${formatNumber(value, { maximumFractionDigits: 0 })}d`;
  const formatDecimal = (value: number) =>
    formatNumber(value, { maximumFractionDigits: 1 });
  const qtyUnit =
    statistics?.averageOrderVolumeUnit ?? orderQtyUnit(orderTimelines);
  const formatVolume = (value: number) =>
    qtyUnit
      ? `${formatDecimal(value)} ${qtyUnit.toLowerCase()}`
      : formatDecimal(value);
  const hasRouteFilter =
    activeRoute != null &&
    pipelineSummaries != null &&
    Object.keys(pipelineSummaries).length > 1;
  const routeScopedHelp =
    hasRouteFilter && routeScopeLabel
      ? `Scoped to deliveries ${routeScopeLabel} over the last ${rangeLabel.replace(/^last /i, "")}. If an order line spans multiple routes, each route includes only its own deliveries.`
      : null;
  const helpWithRouteScope = (mainContent: string) =>
    routeScopedHelp ? (
      <span className={tooltipContent}>
        <span>{mainContent}</span>
        <span>{routeScopedHelp}</span>
      </span>
    ) : (
      mainContent
    );
  const statisticCards = statistics
    ? [
        {
          label: "Median when covered by stock",
          value: statistics.fromStockMedianDays,
          format: formatDays,
          help: helpWithRouteScope(
            "Median order-to-goods-issue time for sales-order lines covered by existing stock.",
          ),
        },
        {
          label: "Median wait for stock availability",
          value: statistics.awaitedProductionWaitMedianDays,
          format: formatDays,
          help: helpWithRouteScope(
            "For dispatched sales-order lines that awaited production, median time from order creation until all dispatched batches were available.",
          ),
        },
        {
          label: "Stock age when ordered",
          value: statistics.stockAgeMedianDays,
          format: formatDays,
          help: helpWithRouteScope(
            "For dispatched sales-order lines covered by existing stock, median age of the latest produced batch when the order was created.",
          ),
        },
        {
          label: "Average batches per order",
          value: statistics.averageBatchesPerOrder,
          format: formatDecimal,
          help: helpWithRouteScope(
            "Average number of distinct dispatched batches on the selected route per sales order, combining its included lines.",
          ),
        },
        {
          label: "Average order volume",
          value: statistics.averageOrderVolume,
          format: formatVolume,
          help: helpWithRouteScope(
            `Average total dispatched quantity per sales order, combining all of its lines${qtyUnit ? ` (${qtyUnit.toLowerCase()})` : ""}.`,
          ),
        },
        {
          label: "Open order lines",
          value: statistics.openOrderCount,
          format: (value: number) => formatNumber(value),
          help: "Sales order lines with no goods issue yet. Dataset-wide and not filtered by destination.",
        },
        {
          label: "Median age of open orders",
          value: statistics.openMedianAgeDays,
          format: formatDays,
          help: `Age of open sales order lines, measured as of ${
            statistics.observedAsOf ?? "the latest extract date"
          }. Dataset-wide and not filtered by destination.`,
        },
      ].filter((card) => card.value != null)
    : [];

  return (
    <div className={stack}>
      <div className={headerRow}>
        <div className={titleGroup}>
          <h3 className={title}>Customer Order Pipeline</h3>
          <span className={coverageText}>{coverageLabel}</span>
        </div>
        {hasStatistics && (
          <Button
            variant="subtle"
            tone="neutral"
            size="xs"
            iconName={collapsed ? "chevronDown" : "chevronUp"}
            onClick={() =>
              setCollapsed((currentCollapsed) => {
                const nextCollapsed = !currentCollapsed;
                onExpandedChange?.(!nextCollapsed);
                return nextCollapsed;
              })
            }
            aria-label={
              collapsed ? "Expand customer orders" : "Collapse customer orders"
            }
          />
        )}
      </div>

      {!collapsed && statistics != null && (
        <>
          {shares != null && (
            <>
              <div className={chipsRow}>
                <Tooltip
                  content="Share of dispatched sales-order lines whose linked batches were available when the order was created."
                  openDelay="fast"
                >
                  <StatChip
                    value={formatPercent(shares.fromStockPct)}
                    label="from stock"
                  />
                </Tooltip>
                <Tooltip
                  content="Share of dispatched sales-order lines for which at least one linked batch became available after the order was created."
                  openDelay="fast"
                >
                  <StatChip
                    value={formatPercent(shares.awaitedProductionPct)}
                    label="awaited production"
                    isHighlight={shares.awaitedProductionPct > 50}
                  />
                </Tooltip>
                {shares.unknownPct > 0 && (
                  <Tooltip
                    content="Share of dispatched sales-order lines where the extract could not determine whether stock was available when the order was created."
                    openDelay="fast"
                  >
                    <StatChip
                      value={formatPercent(shares.unknownPct)}
                      label="unknown batch origin"
                    />
                  </Tooltip>
                )}
                <Tooltip
                  content="Share of dispatched sales-order lines with a formal make-to-order link to a production order."
                  openDelay="fast"
                >
                  <StatChip
                    value={formatPercent(shares.mtoPeggedPct)}
                    label="MTO"
                  />
                </Tooltip>
              </div>

              <PipelineWaterfall
                summaries={result.pipeline}
                activeRoute="orders"
                showPercentileRows
              />
            </>
          )}

          {statisticCards.length > 0 && (
            <div className={statsSection}>
              <div className={statsGrid}>
                {statisticCards.map((card) => (
                  <Tooltip
                    key={card.label}
                    content={card.help}
                    className={statCard}
                    openDelay="fast"
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

          {shares != null && (
            <div className={lookupDivider}>
              <OrderLookup orderLines={result.lines} />
            </div>
          )}
        </>
      )}
    </div>
  );
};
