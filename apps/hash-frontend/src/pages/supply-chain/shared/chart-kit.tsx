import { css } from "@hashintel/ds-helpers/css";

import { chartTheme } from "./chart-theme";

import type { KeyboardEvent, MouseEvent } from "react";

/**
 * Shared visual primitives for the Recharts-based charts: the custom tick/dot
 * SVG renderers and the legend swatch. The dark tooltip style objects live in
 * `chart-format.ts` (a non-component module) because Recharts inspects the
 * element type of its direct children and the `<Tooltip>` must stay inline.
 */

const legendRowSm = css({ display: "flex", alignItems: "center", gap: "1" });
const legendRowMd = css({ display: "flex", alignItems: "center", gap: "1.5" });
const swatchDashed = css({
  width: "4",
  height: "0",
  borderTopWidth: "2px",
  borderTopStyle: "dashed",
});
const swatchSolid = css({ width: "4", height: "0.5", borderRadius: "full" });
const legendLabelSm = css({
  textStyle: "xxs",
  color: "fg.max",
  letterSpacing: "[0.2px]",
});
const legendLabelMd = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.heading",
  letterSpacing: "[0.12px]",
});

export const ClickableMonthTick = ({
  x: xValue,
  y: yValue,
  payload,
  months,
  onMonthClick,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
  months: Array<{ month: string; label: string }>;
  onMonthClick?: (month: string) => void;
}) => {
  const label = String(payload?.value ?? "");
  const month = months.find((month2) => month2.label === label)?.month;
  const clickable = onMonthClick && month;
  const handleClick = clickable
    ? (event: MouseEvent<SVGGElement>) => {
        event.stopPropagation();
        onMonthClick(month);
      }
    : undefined;
  const handleKeyDown = clickable
    ? (event: KeyboardEvent<SVGGElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onMonthClick(month);
        }
      }
    : undefined;

  return (
    <g
      transform={`translate(${xValue ?? 0},${yValue ?? 0})`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Open data for ${month}` : undefined}
      style={clickable ? { cursor: "pointer" } : undefined}
    >
      <text
        x={0}
        y={0}
        dy={16}
        textAnchor="middle"
        fill={chartTheme.axis.tickStrong}
        fontSize={10}
        letterSpacing={0.2}
      >
        {label}
      </text>
    </g>
  );
};

export const CustomDot = ({
  cx,
  cy,
  color,
  payload,
  onMonthClick,
}: {
  cx?: number;
  cy?: number;
  color: string;
  payload?: { month?: string };
  onMonthClick?: (month: string) => void;
}) => {
  if (cx == null || cy == null) {
    return null;
  }
  const month = payload?.month;
  const handleClick =
    onMonthClick && month
      ? (event: MouseEvent<SVGElement>) => {
          event.stopPropagation();
          onMonthClick(month);
        }
      : undefined;
  const handleKeyDown =
    onMonthClick && month
      ? (event: KeyboardEvent<SVGGElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onMonthClick(month);
          }
        }
      : undefined;
  return (
    <g style={handleClick ? { cursor: "pointer" } : undefined}>
      <rect
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role={handleClick ? "button" : undefined}
        tabIndex={handleClick ? 0 : undefined}
        aria-label={handleClick ? `Open data for ${month}` : undefined}
        x={cx - 4}
        y={cy - 4}
        width={8}
        height={8}
        rx={4}
        fill={color}
        stroke={chartTheme.axis.line}
        strokeWidth={0.5}
      />

      <circle
        pointerEvents="none"
        cx={cx}
        cy={cy}
        r={2}
        fill="rgba(255,255,255,0.4)"
      />
    </g>
  );
};

/**
 * Legend swatch + label. `size="sm"` matches the dense trend-chart legend;
 * `size="md"` matches the savings-calculator legend. `dashed` renders a
 * dashed reference line swatch instead of a solid bar.
 */
export const LegendLine = ({
  color,
  label,
  dashed,
  size = "sm",
}: {
  color: string;
  label: string;
  dashed?: boolean;
  size?: "sm" | "md";
}) => {
  return (
    <div className={size === "md" ? legendRowMd : legendRowSm}>
      <div
        className={dashed ? swatchDashed : swatchSolid}
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
      />

      <span className={size === "md" ? legendLabelMd : legendLabelSm}>
        {label}
      </span>
    </div>
  );
};
