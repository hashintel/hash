import { Icon, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { formatNumber } from "../cost";
import { countNoun, countTooltip } from "../observation-labels";
import { formatMonthLabel, previousPeriodLabel } from "./step-detail-format";

import type { PeriodComparison } from "../period-trends";
import type { TimeRange } from "../time-range";
import type { StepDetail as StepDetailType, StepStats } from "../types";
import type { Dimension } from "./distribution-chart";

const teal = css({ color: "[#12a594]" });
const danger = css({ color: "status.error.fg.body" });
const muted = css({ color: "fg.subtle" });

const periodLabelText = css({
  textStyle: "xs",
  color: "fg.subtle",
  letterSpacing: "[0.1px]",
});
const periodCurrent = css({ color: "fg.muted", fontWeight: "medium" });

const cell = css({
  flex: "1",
  p: "3",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderRightColor: "bd.subtle",
});
const cellTooltip = css({
  flex: "1",
  display: "flex",
  flexDirection: "column",
  p: "3",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderRightColor: "bd.subtle",
  cursor: "default",
});
const tooltipLines = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  textAlign: "left",
});
const cellLabel = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  letterSpacing: "[0.12px]",
  mb: "2.5",
});
const valueRow = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  position: "relative",
});
const valueText = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.max",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "[20px]",
});
const unitText = css({
  textStyle: "xxs",
  color: "fg.subtle",
  letterSpacing: "[0.2px]",
});

const badgeBase = css({
  position: "absolute",
  right: "0",
  bottom: "0",
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  textStyle: "xs",
  fontWeight: "medium",
  borderRadius: "sm",
  pl: "1.5",
  pr: "1",
  h: "4",
  lineHeight: "[11px]",
  borderWidth: "1px",
  borderStyle: "solid",
});
const badgeSuccess = css({
  bg: "status.success.bg.subtle",
  color: "status.success.fg.body",
  borderColor: "status.success.bd.subtle",
});
const badgeDanger = css({
  bg: "status.error.bg.subtle",
  color: "status.error.fg.body",
  borderColor: "status.error.bd.subtle",
});

const deltaWrap = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5",
});
const deltaWrapTooltip = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5",
  cursor: "default",
});
const deltaValueBase = css({
  textStyle: "xs",
  fontWeight: "normal",
  letterSpacing: "[0.12px]",
  fontVariantNumeric: "tabular-nums",
});

const statsWrap = css({ display: "flex", flexDirection: "column", gap: "1.5" });
const normNoteText = css({
  textStyle: "xs",
  color: "fg.muted",
  letterSpacing: "[0.1px]",
  fontStyle: "italic",
});
const statsGrid = css({ display: "flex", gap: "2" });
const statTile = css({
  flex: "1",
  bg: "bg.subtle",
  borderRadius: "lg",
  p: "3",
});
const statTileRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});
const dashText = css({
  textStyle: "xs",
  color: "fg.subtle",
  letterSpacing: "[0.12px]",
});

// The ds `Tooltip` trigger wrapper sets `line-height:0`; left as-is it collapses
// the dashed underline on `obsNoun` so it reads as a strike-through. Restoring a
// normal line box on the wrapper keeps the underline beneath the text.
const obsTrigger = css({ display: "inline-flex", lineHeight: "normal" });
const obsLines = css({
  display: "inline-flex",
  flexDirection: "column",
  gap: "0.5",
});
const obsWrap = css({
  display: "inline-flex",
  flexShrink: "0",
  alignItems: "baseline",
  gap: "1",
  whiteSpace: "nowrap",
});
const obsCount = css({
  fontWeight: "medium",
  color: "fg.max",
  fontVariantNumeric: "tabular-nums",
});
const obsNoun = css({
  color: "fg.subtle",
  borderBottomWidth: "1px",
  borderBottomStyle: "dashed",
  borderBottomColor: "bd.strong",
  cursor: "default",
});

const iconShrink = css({ flexShrink: "0" });

export const DeltaIcon = ({
  value,
  invertColor,
}: {
  value: number;
  invertColor?: boolean;
}) => {
  const upColor = invertColor ? teal : danger;
  const downColor = invertColor ? danger : teal;
  if (value > 0) {
    return <Icon name="arrowTrendUp" size="xs" className={upColor} />;
  }
  return <Icon name="arrowTrendDown" size="xs" className={downColor} />;
};

export const ClockIcon = () => {
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

export const PeriodLabel = ({
  comparison,
}: {
  comparison: PeriodComparison | null;
}) => {
  if (!comparison?.currentRange) {
    return null;
  }
  const current = `${formatMonthLabel(comparison.currentRange.from)} – ${formatMonthLabel(comparison.currentRange.to)}`;
  if (!comparison.previousRange) {
    return <div className={periodLabelText}>{current}</div>;
  }
  const previous = `${formatMonthLabel(comparison.previousRange.from)} – ${formatMonthLabel(comparison.previousRange.to)}`;
  return (
    <div className={periodLabelText}>
      <span className={periodCurrent}>{current}</span> trend vs {previous}
    </div>
  );
};

export const PlanningAssumptionCell = ({
  plan,
  hasPlan,
  measureMeetsPlan,
  tooltipLines: tooltipLineItems,
}: {
  plan: number | null;
  hasPlan: boolean;
  measureMeetsPlan: boolean;
  tooltipLines: string[];
}) => {
  const inner = (
    <>
      <div className={cellLabel}>Planning assumption</div>
      <div className={valueRow}>
        <span className={valueText}>{hasPlan ? plan : "–"}</span>
        <span className={unitText}>days</span>
        {hasPlan && (
          <span
            className={cx(
              badgeBase,
              measureMeetsPlan ? badgeSuccess : badgeDanger,
            )}
          >
            <ClockIcon />
            {plan}d
          </span>
        )}
      </div>
    </>
  );

  if (tooltipLineItems.length === 0) {
    return <div className={cell}>{inner}</div>;
  }

  return (
    <Tooltip
      position="bottom"
      openDelay="fast"
      content={
        <span className={tooltipLines}>
          {tooltipLineItems.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      }
      className={cellTooltip}
    >
      {inner}
    </Tooltip>
  );
};

export const DeltaWithTooltip = ({
  delta,
  previousValue,
  unit,
  invertColor,
  previousRange,
}: {
  delta: number;
  previousValue?: string | null;
  unit?: string;
  invertColor?: boolean;
  previousRange?: string | null;
}) => {
  const posColor = invertColor ? teal : danger;
  const negColor = invertColor ? danger : teal;
  const deltaColor = delta > 0 ? posColor : delta < 0 ? negColor : muted;

  const content = (
    <>
      <DeltaIcon value={delta} invertColor={invertColor} />
      <span className={cx(deltaValueBase, deltaColor)}>
        {delta > 0 ? "+" : ""}
        {formatNumber(delta, { maximumFractionDigits: 1 })}%
      </span>
    </>
  );

  if (!previousValue) {
    return <span className={deltaWrap}>{content}</span>;
  }

  return (
    <Tooltip
      position="bottom"
      openDelay="fast"
      content={`vs ${previousValue}${unit ?? ""}${previousRange ? ` (${previousRange})` : ""}`}
      className={deltaWrapTooltip}
    >
      {content}
    </Tooltip>
  );
};

export const StatsRow = ({
  step,
  deltas,
  stats: overrideStats,
  unit = "d",
  invertColor,
  comparison,
}: {
  step: StepDetailType;
  deltas: Record<string, number | null> | null;
  stats?: StepStats | null;
  unit?: string;
  invertColor?: boolean;
  comparison?: PeriodComparison | null;
}) => {
  const step2 = overrideStats ?? step.stats;

  const items: {
    label: string;
    value: number | null;
    deltaKey: string;
    statsKey: keyof StepStats;
  }[] = [
    { label: "Mean", value: step2.mean, deltaKey: "mean", statsKey: "mean" },
    {
      label: "Median",
      value: step2.median,
      deltaKey: "median",
      statsKey: "median",
    },
    { label: "Std Dev", value: step2.std, deltaKey: "std", statsKey: "std" },
    { label: "P75", value: step2.p75, deltaKey: "p75", statsKey: "p75" },
    { label: "P95", value: step2.p95, deltaKey: "p95", statsKey: "p95" },
    { label: "Max", value: step2.max, deltaKey: "max", statsKey: "max" },
  ];

  const fmt = (value: number) => {
    return `${formatNumber(value, { maximumFractionDigits: Number.isInteger(value) ? 0 : 1 })}${unit}`;
  };

  const prevRangeLabel = previousPeriodLabel(comparison?.previousRange);
  const norm = step.normalization;

  return (
    <div className={statsWrap}>
      <PeriodLabel comparison={comparison ?? null} />
      {norm && (
        <div className={normNoteText}>
          Durations normalised to a{" "}
          {formatNumber(norm.qty, { maximumFractionDigits: 0 })}{" "}
          {norm.unit ?? ""} batch ({norm.basis}; n={norm.n_batches},{" "}
          {norm.window})
        </div>
      )}
      <div className={statsGrid}>
        {items.map((item) => {
          const delta = deltas?.[item.deltaKey] ?? null;
          const prevVal = comparison?.previousStats?.[item.statsKey];
          const prevFormatted = prevVal != null ? fmt(prevVal) : null;
          return (
            <div key={item.label} className={statTile}>
              <div className={cellLabel}>{item.label}</div>
              <div className={statTileRow}>
                <span className={valueText}>
                  {item.value != null ? fmt(item.value) : "–"}
                </span>
                {delta != null ? (
                  <DeltaWithTooltip
                    delta={delta}
                    previousValue={prevFormatted}
                    invertColor={invertColor}
                    previousRange={prevRangeLabel}
                  />
                ) : (
                  <span className={dashText}>–</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ObservationCount = ({
  step,
  stats,
  dimension,
  timeRange,
  selectedComponent,
  countOverride,
  previousCount,
}: {
  step: StepDetailType;
  stats: StepStats | null;
  dimension: Dimension;
  timeRange: TimeRange;
  selectedComponent: boolean;
  countOverride?: number | null;
  previousCount?: number | null;
}) => {
  const count = countOverride ?? stats?.n ?? step.stats.n;
  const periodMonths = timeRange === "3m" ? 3 : timeRange === "6m" ? 6 : 12;
  const periodLabel = `last ${periodMonths} months`;
  const noun = countNoun({
    id: step.id,
    label: step.label,
    type: step.type,
    dimension,
    selectedComponent,
  });
  return (
    <Tooltip
      position="bottom"
      openDelay="fast"
      className={obsTrigger}
      content={countTooltip({
        id: step.id,
        label: step.label,
        type: step.type,
        dimension,
        selectedComponent,
        count,
        rangeLabel: timeRange,
        nBatches: step.n_batches,
        nMovements: step.n_movements,
      })}
    >
      <span className={obsLines}>
        <span className={obsWrap}>
          <span className={obsCount}>{formatNumber(count)}</span>
          <span className={obsNoun}>
            {noun} ({periodLabel})
          </span>
        </span>
        {previousCount != null && (
          <span className={obsWrap}>
            <span className={obsCount}>{formatNumber(previousCount)}</span>
            <span className={obsNoun}>
              {noun} (previous {periodMonths} months)
            </span>
          </span>
        )}
      </span>
    </Tooltip>
  );
};
