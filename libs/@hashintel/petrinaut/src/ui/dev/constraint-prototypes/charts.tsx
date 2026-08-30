/**
 * The prototypes' plotting kit: small pure-SVG charts (a trace with a safe
 * band, a per-step margin strip, a function curve, a 2D sample scatter over
 * a feasibility heatmap). Props in, SVG out — no effects, no libraries, so
 * every chart re-renders synchronously as the user drags a slider.
 */

import { css } from "@hashintel/ds-helpers/css";

const SAFE_FILL = "rgb(34 197 94 / 0.12)";
const VIOLATION_FILL = "rgb(239 68 68 / 0.16)";
const GRID_STROKE = "rgb(100 116 139 / 0.25)";
const SERIES_COLORS = ["#2563eb", "#9333ea", "#0d9488", "#d97706"];

const frameStyle = css({
  border: "1px solid",
  borderColor: "neutral.a45",
  borderRadius: "sm",
  backgroundColor: "neutral.s00",
  display: "block",
  maxWidth: "full",
});

const axisLabelStyle = {
  fontSize: 9,
  fill: "rgb(100 116 139)",
  fontFamily: "ui-sans-serif, system-ui",
} as const;

function domainOf(values: number[]): [number, number] {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return [0, 1];
  }
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const pad = (max - min || 1) * 0.08;
  return [min - pad, max + pad];
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }
  return value.toFixed(1);
}

export type TraceSeries = {
  name: string;
  values: readonly number[];
  color?: string;
};

/**
 * A run over time: one line per series, an optional shaded safe band for
 * the constrained quantity, and red column washes on violating steps.
 */
export const TracePlot = ({
  times,
  series,
  band,
  violations,
  width = 560,
  height = 180,
}: {
  times: readonly number[];
  series: readonly TraceSeries[];
  /** Safe interval for the first series' units; either edge optional. */
  band?: { min?: number; max?: number };
  /** Per-step violation flags, painted as column washes. */
  violations?: readonly boolean[];
  width?: number;
  height?: number;
}) => {
  const [tMin, tMax] = [times[0] ?? 0, times[times.length - 1] ?? 1];
  const [yMin, yMax] = domainOf([
    ...series.flatMap((entry) => [...entry.values]),
    ...(band?.min !== undefined ? [band.min] : []),
    ...(band?.max !== undefined ? [band.max] : []),
  ]);
  const x = (time: number) =>
    8 + ((time - tMin) / (tMax - tMin || 1)) * (width - 16);
  const y = (value: number) =>
    height - 16 - ((value - yMin) / (yMax - yMin || 1)) * (height - 28);

  const bandTop = y(band?.max ?? yMax);
  const bandBottom = y(band?.min ?? yMin);

  return (
    <svg
      className={frameStyle}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Trace plot"
    >
      {band ? (
        <rect
          x={8}
          width={width - 16}
          y={Math.min(bandTop, bandBottom)}
          height={Math.abs(bandBottom - bandTop)}
          fill={SAFE_FILL}
        />
      ) : null}
      {violations?.map((violated, index) =>
        violated ? (
          <rect
            // eslint-disable-next-line react/no-array-index-key -- steps are positional
            key={index}
            x={x(times[index]!)}
            width={Math.max(1, (width - 16) / times.length)}
            y={12}
            height={height - 28}
            fill={VIOLATION_FILL}
          />
        ) : null,
      )}
      {[yMin, (yMin + yMax) / 2, yMax].map((tick) => (
        <g key={tick}>
          <line
            x1={8}
            x2={width - 8}
            y1={y(tick)}
            y2={y(tick)}
            stroke={GRID_STROKE}
            strokeDasharray="2 4"
          />
          <text x={10} y={y(tick) - 2} style={axisLabelStyle}>
            {formatTick(tick)}
          </text>
        </g>
      ))}
      {series.map((entry, index) => (
        <polyline
          key={entry.name}
          fill="none"
          stroke={entry.color ?? SERIES_COLORS[index % SERIES_COLORS.length]}
          strokeWidth={1.6}
          points={[...entry.values]
            .map((value, step) => `${x(times[step]!)},${y(value)}`)
            .join(" ")}
        />
      ))}
      {series.map((entry, index) => (
        <text
          key={entry.name}
          x={12 + index * 110}
          y={height - 4}
          style={{
            ...axisLabelStyle,
            fill: entry.color ?? SERIES_COLORS[index % SERIES_COLORS.length],
          }}
        >
          {entry.name}
        </text>
      ))}
    </svg>
  );
};

/** Per-step margins as a signed strip: green above zero, red below. */
export const MarginStrip = ({
  values,
  width = 560,
  height = 56,
}: {
  values: readonly number[];
  width?: number;
  height?: number;
}) => {
  const magnitude = Math.max(
    1e-9,
    ...values.map((value) => (Number.isFinite(value) ? Math.abs(value) : 0)),
  );
  const mid = height / 2;
  const barWidth = (width - 16) / Math.max(1, values.length);
  return (
    <svg
      className={frameStyle}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Margin over time"
    >
      <line x1={8} x2={width - 8} y1={mid} y2={mid} stroke={GRID_STROKE} />
      {values.map((value, index) => {
        const clamped = Number.isFinite(value)
          ? value
          : Math.sign(value) * magnitude;
        const extent = (Math.abs(clamped) / magnitude) * (mid - 6);
        return (
          <rect
            // eslint-disable-next-line react/no-array-index-key -- steps are positional
            key={index}
            x={8 + index * barWidth}
            width={Math.max(0.8, barWidth - 0.4)}
            y={clamped >= 0 ? mid - extent : mid}
            height={Math.max(0.5, extent)}
            fill={
              clamped >= 0 ? "rgb(34 197 94 / 0.7)" : "rgb(239 68 68 / 0.8)"
            }
          />
        );
      })}
      <text x={10} y={10} style={axisLabelStyle}>
        margin per step (green = satisfied)
      </text>
    </svg>
  );
};

/** A function curve over a domain with an optional marker point. */
export const CurvePlot = ({
  domain,
  fn,
  marker,
  label,
  width = 280,
  height = 140,
}: {
  domain: [number, number];
  fn: (x: number) => number;
  marker?: number;
  label?: string;
  width?: number;
  height?: number;
}) => {
  const samples = 120;
  const xs = Array.from(
    { length: samples + 1 },
    (_, index) => domain[0] + ((domain[1] - domain[0]) * index) / samples,
  );
  const values = xs.map(fn);
  const [yMin, yMax] = domainOf([...values, 0, 1]);
  const x = (value: number) =>
    8 + ((value - domain[0]) / (domain[1] - domain[0] || 1)) * (width - 16);
  const y = (value: number) =>
    height - 16 - ((value - yMin) / (yMax - yMin || 1)) * (height - 24);
  return (
    <svg
      className={frameStyle}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? "Curve"}
    >
      <line x1={x(0)} x2={x(0)} y1={8} y2={height - 16} stroke={GRID_STROKE} />
      <line x1={8} x2={width - 8} y1={y(0)} y2={y(0)} stroke={GRID_STROKE} />
      <polyline
        fill="none"
        stroke="#2563eb"
        strokeWidth={1.6}
        points={xs
          .map((value, index) => `${x(value)},${y(values[index]!)}`)
          .join(" ")}
      />
      {marker !== undefined ? (
        <circle cx={x(marker)} cy={y(fn(marker))} r={3.5} fill="#dc2626" />
      ) : null}
      {label ? (
        <text x={10} y={12} style={axisLabelStyle}>
          {label}
        </text>
      ) : null}
    </svg>
  );
};

/**
 * 2D samples over a coarse feasibility grid: the region test paints safe
 * cells green, sample points are dots (violating ones red).
 */
export const ScatterPlot = ({
  xName,
  yName,
  xDomain,
  yDomain,
  points,
  regionTest,
  title,
  size = 240,
}: {
  xName: string;
  yName: string;
  xDomain: [number, number];
  yDomain: [number, number];
  points: readonly { x: number; y: number; ok: boolean }[];
  regionTest?: (x: number, y: number) => boolean;
  title?: string;
  size?: number;
}) => {
  const cells = 24;
  const x = (value: number) =>
    26 + ((value - xDomain[0]) / (xDomain[1] - xDomain[0] || 1)) * (size - 34);
  const y = (value: number) =>
    size -
    22 -
    ((value - yDomain[0]) / (yDomain[1] - yDomain[0] || 1)) * (size - 34);
  const cellsFlat: { cx: number; cy: number; ok: boolean }[] = [];
  if (regionTest) {
    for (let column = 0; column < cells; column += 1) {
      for (let row = 0; row < cells; row += 1) {
        const px =
          xDomain[0] + ((column + 0.5) / cells) * (xDomain[1] - xDomain[0]);
        const py =
          yDomain[0] + ((row + 0.5) / cells) * (yDomain[1] - yDomain[0]);
        cellsFlat.push({ cx: px, cy: py, ok: regionTest(px, py) });
      }
    }
  }
  const cellWidth = (size - 34) / cells;
  const cellHeight = (size - 34) / cells;
  return (
    <svg
      className={frameStyle}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={title ?? "Sample scatter"}
    >
      {cellsFlat.map((cell) =>
        cell.ok ? (
          <rect
            key={`${cell.cx}:${cell.cy}`}
            x={x(cell.cx) - cellWidth / 2}
            y={y(cell.cy) - cellHeight / 2}
            width={cellWidth + 0.5}
            height={cellHeight + 0.5}
            fill={SAFE_FILL}
          />
        ) : null,
      )}
      {points.map((point, index) => (
        <circle
          // eslint-disable-next-line react/no-array-index-key -- samples are positional
          key={index}
          cx={x(point.x)}
          cy={y(point.y)}
          r={2}
          fill={point.ok ? "rgb(37 99 235 / 0.75)" : "rgb(220 38 38 / 0.85)"}
        />
      ))}
      {title ? (
        <text x={26} y={12} style={axisLabelStyle}>
          {title}
        </text>
      ) : null}
      <text
        x={size / 2}
        y={size - 6}
        style={axisLabelStyle}
        textAnchor="middle"
      >
        {xName}
      </text>
      <text
        x={8}
        y={size / 2}
        style={axisLabelStyle}
        transform={`rotate(-90 8 ${size / 2})`}
        textAnchor="middle"
      >
        {yName}
      </text>
    </svg>
  );
};
