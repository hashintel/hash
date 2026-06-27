import { useMemo } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { chartTheme } from "../../shared/chart-theme";
import { formatNumber } from "../../shared/cost";

import type { StepStats } from "../../shared/types";

/**
 * Lightweight, print-friendly SVG/div charts for the opportunity brief. Kept
 * separate from the recharts-based slideover charts so the brief renders crisply
 * on paper (no responsive container, strokes stay 1px via non-scaling-stroke).
 */

const chartWrap = css({ display: "flex", flexDirection: "column", gap: "1.5" });
const chartTitle = css({
  textStyle: "xs",
  fontWeight: "semibold",
  textTransform: "uppercase",
  letterSpacing: "[0.08em]",
  color: "fg.muted",
});
const axisRow = css({
  display: "flex",
  justifyContent: "space-between",
  textStyle: "xs",
  color: "fg.subtle",
  fontVariantNumeric: "tabular-nums",
});
const boxSvg = css({ width: "full", height: "[56px]" });
const sparkSvg = css({ width: "full", height: "[40px]" });
const histRow = css({
  display: "flex",
  alignItems: "flex-end",
  gap: "[1px]",
  h: "[64px]",
});
const histBarCell = css({
  flex: "1",
  h: "full",
  display: "flex",
  alignItems: "flex-end",
});
const histBar = css({
  w: "full",
  minH: "[1px]",
  borderTopRadius: "sm",
  bg: "status.info.bg.solid",
});
const legendRow = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "3",
  textStyle: "xs",
  color: "fg.muted",
});
const legendItem = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
});
const legendSwatch = css({
  display: "inline-block",
  h: "2",
  w: "2",
  borderRadius: "full",
});

function scale(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }
  return ((value - min) / (max - min)) * 100;
}

/** Horizontal box plot: whiskers min..max, box P25-P75, median, P95 and an
 *  optional plan reference. Coordinates are percentages on a non-uniform SVG. */
export const BriefBoxPlot = ({
  stats,
  plan,
}: {
  stats: StepStats;
  plan?: number | null;
}) => {
  const { min, max, p25, p75, median, p95 } = stats;
  if (
    min == null ||
    max == null ||
    p25 == null ||
    p75 == null ||
    median == null ||
    max <= min
  ) {
    return null;
  }
  const xValue = (value: number) => scale(value, min, max);
  const planIn = plan != null && plan >= min && plan <= max;
  const boxWidth = Math.max(0, xValue(p75) - xValue(p25));
  return (
    <div className={chartWrap}>
      <span className={chartTitle}>Distribution (box plot)</span>
      <svg
        className={boxSvg}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label="Box plot of observed durations"
      >
        <line
          x1={xValue(min)}
          x2={xValue(p25)}
          y1="50"
          y2="50"
          stroke={chartTheme.axis.tick}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        <line
          x1={xValue(p75)}
          x2={xValue(max)}
          y1="50"
          y2="50"
          stroke={chartTheme.axis.tick}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        <line
          x1={xValue(min)}
          x2={xValue(min)}
          y1="34"
          y2="66"
          stroke={chartTheme.axis.tick}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        <line
          x1={xValue(max)}
          x2={xValue(max)}
          y1="34"
          y2="66"
          stroke={chartTheme.axis.tick}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        <rect
          x={xValue(p25)}
          y="22"
          width={boxWidth}
          height="56"
          fill={chartTheme.series.info}
          fillOpacity="0.18"
          stroke={chartTheme.series.info}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        <line
          x1={xValue(median)}
          x2={xValue(median)}
          y1="22"
          y2="78"
          stroke={chartTheme.series.info}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />

        {p95 != null && (
          <line
            x1={xValue(p95)}
            x2={xValue(p95)}
            y1="26"
            y2="74"
            stroke={chartTheme.series.warning}
            strokeWidth="1.5"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {planIn && (
          <line
            x1={xValue(plan)}
            x2={xValue(plan)}
            y1="14"
            y2="86"
            stroke={chartTheme.series.critical}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className={axisRow}>
        <span>min {formatNumber(min, { maximumFractionDigits: 1 })}d</span>
        <span>
          median {formatNumber(median, { maximumFractionDigits: 1 })}d
        </span>
        <span>max {formatNumber(max, { maximumFractionDigits: 1 })}d</span>
      </div>
      <div className={legendRow}>
        <span className={legendItem}>
          <span
            className={legendSwatch}
            style={{ background: chartTheme.series.info }}
          />
          Median / IQR
        </span>
        <span className={legendItem}>
          <span
            className={legendSwatch}
            style={{ background: chartTheme.series.warning }}
          />
          P95
        </span>
        {planIn && (
          <span className={legendItem}>
            <span
              className={legendSwatch}
              style={{ background: chartTheme.series.critical }}
            />
            Plan
          </span>
        )}
      </div>
    </div>
  );
};

interface SimpleBin {
  label: string;
  start: number;
  end: number;
  count: number;
}

function buildSimpleBins(values: number[]): SimpleBin[] {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) {
    return [];
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  if (max <= min) {
    return [
      {
        label: `${formatNumber(min, { maximumFractionDigits: 1 })}`,
        start: min,
        end: max,
        count: clean.length,
      },
    ];
  }
  const count = Math.min(Math.max(Math.ceil(Math.sqrt(clean.length)), 6), 16);
  const step = (max - min) / count;
  const bins: SimpleBin[] = [];
  for (let index = 0; index < count; index++) {
    const start = min + index * step;
    const end = start + step;
    const isLast = index === count - 1;
    const column = clean.filter(
      (value) => value >= start && (isLast ? value <= end : value < end),
    ).length;
    bins.push({
      label: `${formatNumber(start, { maximumFractionDigits: 1 })}-${formatNumber(end, { maximumFractionDigits: 1 })}`,
      start,
      end,
      count: column,
    });
  }
  return bins;
}

/** Compact histogram of observed values as flex bars. */
export const BriefHistogram = ({ values }: { values: number[] }) => {
  const bins = useMemo(() => buildSimpleBins(values), [values]);
  if (bins.length === 0) {
    return null;
  }
  const maxCount = Math.max(...bins.map((right) => right.count), 1);
  const firstBin = bins[0];
  const lastBin = bins[bins.length - 1];
  if (!firstBin || !lastBin) {
    return null;
  }

  return (
    <div className={chartWrap}>
      <span className={chartTitle}>Histogram</span>
      <div className={histRow}>
        {bins.map((bin) => (
          <div
            key={bin.label}
            className={histBarCell}
            title={`${bin.label}d: ${bin.count}`}
          >
            <div
              className={histBar}
              style={{ height: `${(bin.count / maxCount) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className={axisRow}>
        <span>
          {formatNumber(firstBin.start, { maximumFractionDigits: 1 })}d
        </span>
        <span>
          {formatNumber(lastBin.end, {
            maximumFractionDigits: 1,
          })}
          d
        </span>
      </div>
    </div>
  );
};

/** Monthly trend sparkline (e.g. median by month). */
export const BriefSparkline = ({
  points,
  label,
}: {
  points: number[];
  label: string;
}) => {
  if (points.length < 2) {
    return null;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points
    .map(
      (product, index) =>
        `${(index / (points.length - 1)) * 100},${100 - ((product - min) / range) * 100}`,
    )
    .join(" ");
  return (
    <div className={chartWrap}>
      <span className={chartTitle}>{label}</span>
      <svg
        className={sparkSvg}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
      >
        <polyline
          points={coords}
          fill="none"
          stroke={chartTheme.series.info}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className={axisRow}>
        <span>{formatNumber(points[0], { maximumFractionDigits: 1 })}d</span>
        <span>
          {formatNumber(points[points.length - 1], {
            maximumFractionDigits: 1,
          })}
          d
        </span>
      </div>
    </div>
  );
};
