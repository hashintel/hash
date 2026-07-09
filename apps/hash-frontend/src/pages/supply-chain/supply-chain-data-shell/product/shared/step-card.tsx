import { useMemo, type CSSProperties } from "react";

import { Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  getCategoryColor,
  getCategoryIcon,
  isDwellType,
  isProductionType,
} from "../../../shared/categories";
import {
  useCostParams,
  computePeriodCost,
  formatCost,
  formatNumber,
} from "../../../shared/cost";
import {
  MEASURE_LABELS,
  selectStat,
  useBaseMeasure,
} from "../../../shared/measure-context";
import {
  countTooltip,
  shortCountLabel,
} from "../../../shared/observation-labels";
import {
  planSourceLabel,
  pctChangeTooltip,
} from "../../../shared/planning-param";
// Local portal tooltip retained for the box-plot popover only: it renders rich
// content `bare` (no dark-pill chrome), which the ds `Tooltip` can't express.
import { Tooltip as RichTooltip } from "../../../shared/tooltip";
import { CategoryIcon } from "./category-icon";

import type { GraphNode } from "../../../shared/types";

const cardButton = css({
  display: "block",
  w: "full",
  textAlign: "left",
  borderRadius: "[10px]",
  borderWidth: "1px",
  borderStyle: "solid",
  cursor: "pointer",
  transition: "shadow",
  _hover: { boxShadow: "md" },
});
const topSection = css({
  bg: "bgSolid.min",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderTopRadius: "[10px]",
  p: "2.5",
  display: "flex",
  flexDirection: "column",
  gap: "2.5",
});
const topRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});
const titleWrap = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  minW: "0",
});
const titleText = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.max",
  lineHeight: "[16px]",
  overflow: "hidden",
});
const titleClampStyle: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
};
const valueWrap = css({
  display: "flex",
  alignItems: "baseline",
  gap: "1",
  flexShrink: 0,
  ml: "2",
});
const valueNum = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.max",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "[20px]",
});
const valueUnit = css({
  textStyle: "xxs",
  color: "fg.subtle",
  letterSpacing: "[0.2px]",
});
const normCaption = css({
  textStyle: "xxs",
  color: "fg.subtle",
  letterSpacing: "[0.2px]",
  borderBottomWidth: "1px",
  borderBottomStyle: "dashed",
  borderColor: "[#c0c0c0]",
  alignSelf: "flex-start",
  cursor: "default",
});
const bottomSection = css({ p: "2.5", borderBottomRadius: "[10px]" });
const bottomRow = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1",
  flexWrap: "wrap",
});
const badgeRow = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  flexWrap: "wrap",
  flexGrow: "1",
  flexShrink: "1",
  flexBasis: "0",
  minW: "0",
});
const badgeGapped = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  textStyle: "xs",
  fontWeight: "medium",
  fontFamily: "body",
  borderRadius: "sm",
  pl: "1.5",
  pr: "1",
  h: "4",
  lineHeight: "[11px]",
});
const badgeEven = css({
  display: "inline-flex",
  alignItems: "center",
  textStyle: "xs",
  fontWeight: "medium",
  fontFamily: "body",
  borderRadius: "sm",
  px: "1.5",
  h: "4",
  lineHeight: "[11px]",
});
const costBadge = css({
  display: "inline-flex",
  alignItems: "center",
  textStyle: "xs",
  fontWeight: "medium",
  fontFamily: "body",
  borderRadius: "sm",
  px: "1.5",
  minW: "0",
  minH: "4",
  py: "0.5",
  lineHeight: "[13px]",
  whiteSpace: "normal",
});
const badgeGood = css({
  bg: "status.success.bg.subtle",
  color: "status.success.fg.body",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "status.success.bd.subtle",
});
const badgeBad = css({
  bg: "status.error.bg.subtle",
  color: "status.error.fg.body",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "status.error.bd.subtle",
});
const badgeWarn = css({
  bg: "status.warning.bg.subtle",
  color: "status.warning.fg.body",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "status.warning.bd.subtle",
});
const badgeNeutral = css({
  bg: "bg.subtle",
  color: "fg.muted",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
});
const countLabel = css({
  textStyle: "xs",
  color: "fg.subtle",
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
  ml: "1",
  borderBottomWidth: "1px",
  borderBottomStyle: "dashed",
  borderColor: "[#c0c0c0]",
  cursor: "default",
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  whiteSpace: "nowrap",
});
const noDataPad = css({ p: "2.5" });
const noDataText = css({
  textStyle: "xxs",
  color: "fg.subtle",
  fontStyle: "italic",
});
const iconShrink = css({ flexShrink: 0 });
const warnIcon = css({ flexShrink: 0, color: "status.warning.fg.body" });
const boxPlotRow = css({
  position: "relative",
  h: "3",
  display: "flex",
  alignItems: "center",
});
const whiskerCap = css({
  position: "absolute",
  w: "0.5",
  h: "3",
  borderRadius: "full",
  bg: "[#d7d7d7]",
});
const whiskerLine = css({
  position: "absolute",
  h: "[1px]",
  borderTopWidth: "1px",
  borderTopStyle: "dashed",
  borderColor: "bd.subtle",
});
const iqrBox = css({ position: "absolute", h: "2.5", borderRadius: "sm" });
const medianMark = css({
  position: "absolute",
  w: "0.5",
  h: "3",
  borderRadius: "full",
  bg: "[#64ade6]",
});
const meanMark = css({
  position: "absolute",
  w: "0.5",
  h: "3",
  borderRadius: "full",
  bg: "[#ffce5c]",
});
const tipBox = css({
  bg: "[#202020]",
  borderRadius: "[10px]",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "[rgba(0,0,0,0.13)]",
  boxShadow: "[0px 4px 11px 2px rgba(0,0,0,0.2)]",
  px: "2",
  py: "1.5",
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minW: "[120px]",
});
const tipRow = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  justifyContent: "space-between",
});
const tipRowLeft = css({ display: "flex", alignItems: "center", gap: "1.5" });
const tipSwatchBlue = css({
  w: "3",
  h: "0.5",
  borderRadius: "full",
  bg: "[#64ade6]",
});
const tipSwatchYellow = css({
  w: "3",
  h: "0.5",
  borderRadius: "full",
  bg: "[#ffce5c]",
});
const tipLabel = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "[white]",
  letterSpacing: "[0.12px]",
});
const tipValue = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "[white]",
  letterSpacing: "[0.12px]",
  fontVariantNumeric: "tabular-nums",
});
const tipMuted = css({
  textStyle: "xs",
  color: "[#8d8d8d]",
  letterSpacing: "[0.12px]",
});

function hexToRgb(hex: string) {
  const height = hex.replace("#", "");
  return {
    r: Number.parseInt(height.substring(0, 2), 16),
    g: Number.parseInt(height.substring(2, 4), 16),
    b: Number.parseInt(height.substring(4, 6), 16),
  };
}

function colorTint(hex: string, alpha: number) {
  const { r: row, g: group, b: right } = hexToRgb(hex);
  return `rgba(${row},${group},${right},${alpha})`;
}

interface StepCardProps {
  node: GraphNode;
  onClick: () => void;
  timeRange?: string;
}

const BoxPlotTooltip = ({
  median,
  mean,
  min,
  max,
}: {
  median: number;
  mean: number;
  min: number;
  max: number;
}) => {
  const fmt = (value: number) =>
    `${formatNumber(value, { maximumFractionDigits: 0 })}d`;
  return (
    <div className={tipBox}>
      <div className={tipRow}>
        <div className={tipRowLeft}>
          <div className={tipSwatchBlue} />
          <span className={tipLabel}>Median</span>
        </div>
        <span className={tipValue}>{fmt(median)}</span>
      </div>
      <div className={tipRow}>
        <div className={tipRowLeft}>
          <div className={tipSwatchYellow} />
          <span className={tipLabel}>Mean</span>
        </div>
        <span className={tipValue}>{fmt(mean)}</span>
      </div>
      <div className={tipRow}>
        <span className={tipMuted}>Min</span>
        <span className={tipValue}>{fmt(min)}</span>
      </div>
      <div className={tipRow}>
        <span className={tipMuted}>Max</span>
        <span className={tipValue}>{fmt(max)}</span>
      </div>
    </div>
  );
};
const MiniBoxPlot = ({ stats }: { stats: GraphNode["stats"] }) => {
  const min = stats.min;
  const max = stats.max;
  const p25 = stats.p25;
  const p75 = stats.p75;
  const median = stats.median;
  const mean = stats.mean;
  if (
    min == null ||
    max == null ||
    p25 == null ||
    p75 == null ||
    median == null ||
    mean == null
  ) {
    return null;
  }
  const range = max - min || 1;
  const pct = (value: number) =>
    Math.max(0, Math.min(100, ((value - min) / range) * 100));
  const iqrLeft = pct(p25);
  const iqrWidth = pct(p75) - iqrLeft;
  return (
    <RichTooltip
      delayMs={0}
      bare
      wrapperClassName={css({ display: "block" })}
      content={
        <BoxPlotTooltip median={median} mean={mean} min={min} max={max} />
      }
    >
      <div className={boxPlotRow}>
        <div className={whiskerCap} style={{ left: `${pct(min)}%` }} />
        <div
          className={whiskerLine}
          style={{ left: `${pct(min) + 1}%`, right: `${100 - pct(max) + 1}%` }}
        />

        <div className={whiskerCap} style={{ left: `${pct(max)}%` }} />
        <div
          className={iqrBox}
          style={{
            left: `${iqrLeft}%`,
            width: `${Math.max(iqrWidth, 2)}%`,
            backgroundColor: "rgba(1,156,57,0.12)",
            border: "0.5px solid rgba(1,156,57,0.24)",
            boxShadow: "0 0 0 2px white",
          }}
        />

        <div
          className={medianMark}
          style={{ left: `${pct(median)}%`, boxShadow: "0 0 0 2px white" }}
        />

        <div
          className={meanMark}
          style={{ left: `${pct(mean)}%`, boxShadow: "0 0 0 2px white" }}
        />
      </div>
    </RichTooltip>
  );
};

const ClockIcon = () => {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      className={iconShrink}
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6 3.5V6L7.5 7.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
};

const WarningTriangleIcon = () => {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      className={warnIcon}
      aria-hidden="true"
    >
      <path
        d="M6 1.4 11 10H1L6 1.4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      <path
        d="M6 4.3v2.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      <circle cx="6" cy="8.6" r="0.45" fill="currentColor" />
    </svg>
  );
};
export const StepCard = ({ node, onClick, timeRange }: StepCardProps) => {
  const stats = node.stats;
  const plan = node.plan;
  const { measure } = useBaseMeasure();
  const measureValue = selectStat(stats, measure);
  const hasData = measureValue != null;
  const { waccRate, storageCost } = useCostParams();
  const costCurrency = node.cost?.currency ?? null;
  const unitPrice = node.cost?.unit_price;
  const periodCost = useMemo(() => {
    // Carrying cost sums monthly.total_kg_days, which node.monthly carries.
    // Gate on cost inputs so non-dwell nodes (no unit_price) show no cost.
    const monthly = node.monthly;
    if (!node.cost || unitPrice == null || !monthly || monthly.length === 0) {
      return null;
    }
    return computePeriodCost(monthly, unitPrice, waccRate, storageCost);
  }, [node.monthly, node.cost, unitPrice, waccRate, storageCost]);
  const color = getCategoryColor(node.type);
  const planStatus = useMemo(() => {
    if (!hasData || plan == null || plan === 0) {
      return "neutral";
    }
    const value = measureValue;
    if (value <= plan * 0.9) {
      return "good";
    }
    if (value <= plan * 1.2) {
      return "warn";
    }
    return "bad";
  }, [hasData, plan, measureValue]);
  const pctChange = useMemo(() => {
    if (!plan || !hasData) {
      return null;
    }
    const diff = measureValue - plan;
    return (diff / plan) * 100;
  }, [plan, hasData, measureValue]);
  const eventCount = node.observations?.length ?? node.stats.n;
  const isLowSample = node.stats.n > 0 && node.stats.n < 10;
  return (
    <button
      type="button"
      className={cardButton}
      style={{
        backgroundColor: colorTint(color, 0.06),
        borderColor: colorTint(color, 0.18),
      }}
      onClick={onClick}
    >
      {/* Top section */}
      <div
        className={topSection}
        style={{ borderColor: colorTint(color, 0.18) }}
      >
        <div className={topRow}>
          <div className={titleWrap}>
            <CategoryIcon
              icon={getCategoryIcon(node.type)}
              size={12}
              color={color}
            />

            <span className={titleText} style={titleClampStyle}>
              {node.label}
            </span>
          </div>
          {hasData && (
            <div className={valueWrap}>
              <span className={valueNum}>
                {formatNumber(measureValue, { maximumFractionDigits: 0 })}
              </span>
              <span className={valueUnit}>days</span>
            </div>
          )}
        </div>

        {hasData && isProductionType(node.type) && node.normalization && (
          <span className={normCaption}>
            per{" "}
            {formatNumber(node.normalization.qty, {
              maximumFractionDigits: 0,
            })}{" "}
            {node.normalization.unit ?? ""} batch
          </span>
        )}

        {hasData && <MiniBoxPlot stats={stats} />}
      </div>

      {/* Bottom section */}
      {hasData ? (
        <div className={bottomSection}>
          <div className={bottomRow}>
            <div className={badgeRow}>
              {plan != null && plan > 0 && (
                <Tooltip
                  content={planSourceLabel(node.plan_note)}
                  openDelay="fast"
                >
                  <span
                    className={cx(
                      badgeGapped,
                      planStatus === "good"
                        ? badgeGood
                        : planStatus === "bad"
                          ? badgeBad
                          : badgeWarn,
                    )}
                  >
                    <ClockIcon />
                    {formatNumber(plan, { maximumFractionDigits: 0 })}d
                  </span>
                </Tooltip>
              )}
              {pctChange != null && (
                <Tooltip
                  content={pctChangeTooltip(
                    pctChange,
                    plan ?? 0,
                    MEASURE_LABELS[measure],
                  )}
                  openDelay="fast"
                >
                  <span
                    className={cx(
                      badgeEven,
                      pctChange <= 0 ? badgeGood : badgeBad,
                    )}
                  >
                    {pctChange > 0 ? "+" : ""}
                    {formatNumber(pctChange, { maximumFractionDigits: 0 })}%
                  </span>
                </Tooltip>
              )}
              {isDwellType(node.type) &&
                periodCost != null &&
                periodCost > 0 && (
                  <span className={cx(costBadge, badgeWarn)}>
                    {formatCost(periodCost, costCurrency, { compact: true })}{" "}
                    over {timeRange ?? "total"}
                  </span>
                )}
              {isProductionType(node.type) && node.yield_summary && (
                <Tooltip
                  content={`Receipt ratio: median ${formatNumber(node.yield_summary.median, { maximumFractionDigits: 1 })}% of order quantity (n=${formatNumber(node.yield_summary.n)})`}
                  openDelay="fast"
                >
                  <span
                    className={cx(
                      badgeEven,
                      node.yield_summary.median >= node.yield_summary.reference
                        ? badgeGood
                        : badgeBad,
                    )}
                  >
                    R:
                    {formatNumber(node.yield_summary.median, {
                      maximumFractionDigits: 0,
                    })}
                    %
                  </span>
                </Tooltip>
              )}
              {isProductionType(node.type) && node.consumption_summary && (
                <Tooltip
                  content={`Consumption: weighted ${(node.consumption_summary.weighted_variance ?? node.consumption_summary.median_variance) > 0 ? "+" : ""}${formatNumber(node.consumption_summary.weighted_variance ?? node.consumption_summary.median_variance, { maximumFractionDigits: 1 })}% vs expected (${formatNumber(node.consumption_summary.n_components)} components)`}
                  openDelay="fast"
                >
                  <span
                    className={cx(
                      badgeEven,
                      (node.consumption_summary.weighted_variance ??
                        node.consumption_summary.median_variance) < 0
                        ? badgeNeutral
                        : (node.consumption_summary.weighted_variance ??
                              node.consumption_summary.median_variance) <= 5
                          ? badgeWarn
                          : badgeBad,
                    )}
                  >
                    C:
                    {(node.consumption_summary.weighted_variance ??
                      node.consumption_summary.median_variance) > 0
                      ? "+"
                      : ""}
                    {formatNumber(
                      node.consumption_summary.weighted_variance ??
                        node.consumption_summary.median_variance,
                      { maximumFractionDigits: 1 },
                    )}
                    %
                  </span>
                </Tooltip>
              )}
            </div>
            <Tooltip
              openDelay="fast"
              content={
                isLowSample
                  ? "Low sample count"
                  : node.source
                    ? `${countTooltip({ id: node.id, label: node.label, type: node.type, count: eventCount, rangeLabel: timeRange, nBatches: node.n_batches, nMovements: node.n_movements })}\nSource: ${node.source.label}${node.source.filter ? ` (filter ${node.source.filter})` : ""}`
                    : countTooltip({
                        id: node.id,
                        label: node.label,
                        type: node.type,
                        count: eventCount,
                        rangeLabel: timeRange,
                        nBatches: node.n_batches,
                        nMovements: node.n_movements,
                      })
              }
            >
              <span className={countLabel}>
                {isLowSample && <WarningTriangleIcon />}
                {shortCountLabel(eventCount, {
                  id: node.id,
                  label: node.label,
                  type: node.type,
                })}
              </span>
            </Tooltip>
          </div>
        </div>
      ) : (
        <div className={noDataPad}>
          <div className={noDataText}>
            No data {timeRange ? `in last ${timeRange}` : ""}
          </div>
        </div>
      )}
    </button>
  );
};
