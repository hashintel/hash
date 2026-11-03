import { useEffect, useRef } from "react";
import uPlot from "uplot";

import { useElementSize } from "../../../../../../../react/hooks/use-element-size";
import "uplot/dist/uPlot.min.css";

import { useLatest } from "../../../../../../../react/hooks/use-latest";
import {
  tooltipDotStyle,
  tooltipLabelStyle,
  tooltipStyle,
  tooltipValueStyle,
} from "../simulation-timeline/styles";
import {
  findFiringNear,
  type EventTimelineData,
  type FiringMark,
} from "./series";

import type { TimeRange } from "./use-event-timeline-data";
import type { FC, RefObject } from "react";

/** The narrowest span the view zooms to, in seconds. */
export const MIN_VIEW_SPAN = 0.01;

/** Pixels the pointer may move before a press counts as a pan, not a click. */
const DRAG_THRESHOLD_PX = 3;
/** Pixels around the pointer within which a firing mark is the hovered one. */
const FIRING_HOVER_PX = 6;
/** Height of the firing marks along the bottom of the plot, in CSS pixels. */
const FIRING_MARK_PX = 10;
const REFERENCE_MARK_PX = 4;

const formatSeconds = (time: number): string => `${time.toFixed(3)}s`;

const clampRange = (min: number, span: number, domain: number): TimeRange => {
  const boundedSpan = Math.min(
    Math.max(span, MIN_VIEW_SPAN),
    Math.max(domain, MIN_VIEW_SPAN),
  );
  const boundedMin = Math.min(
    Math.max(min, 0),
    Math.max(0, domain - boundedSpan),
  );
  return { min: boundedMin, max: boundedMin + boundedSpan };
};

interface TooltipNodes {
  root: HTMLDivElement;
  dot: HTMLDivElement;
  name: HTMLSpanElement;
  value: HTMLSpanElement;
  time: HTMLDivElement;
  firing: HTMLDivElement;
}

const createTooltip = (): TooltipNodes => {
  const root = document.createElement("div");
  root.className = tooltipStyle;
  const label = document.createElement("div");
  label.className = tooltipLabelStyle;
  const dot = document.createElement("div");
  dot.className = tooltipDotStyle;
  const name = document.createElement("span");
  const value = document.createElement("span");
  value.className = tooltipValueStyle;
  label.append(dot, name, value);
  const time = document.createElement("div");
  time.style.cssText = "font-size:10px;opacity:0.8;margin-top:2px";
  const firing = document.createElement("div");
  firing.style.cssText = "font-size:10px;margin-top:2px";
  root.append(label, time, firing);
  return { root, dot, name, value, time, firing };
};

/** What the chart reads on every draw and pointer event, kept out of React. */
type ChartState = {
  data: EventTimelineData;
  firings: FiringMark[];
  references: readonly number[];
  transitionNames: ReadonlyMap<string, string>;
  viewRange: TimeRange;
  domain: number;
  time: number;
  onViewRangeChange: (range: TimeRange) => void;
  onScrub: (time: number) => void;
};

/**
 * Reference frames as faint ticks on the time axis: a hint that the state
 * there was recorded rather than interpolated. They are not stepped to.
 */
const drawReferences = (u: uPlot, state: ChartState): void => {
  const { ctx, bbox } = u;
  const dpr = devicePixelRatio;
  const bottom = bbox.top + bbox.height;
  ctx.save();
  ctx.lineWidth = dpr;
  ctx.strokeStyle = "rgba(100, 116, 139, 0.35)";
  ctx.beginPath();
  for (const time of state.references) {
    if (time < state.viewRange.min || time > state.viewRange.max) {
      continue;
    }
    const x = u.valToPos(time, "x", true);
    ctx.moveTo(x, bottom - REFERENCE_MARK_PX * dpr);
    ctx.lineTo(x, bottom);
  }
  ctx.stroke();
  ctx.restore();
};

const drawFirings = (u: uPlot, state: ChartState): void => {
  if (state.data.kind === "lanes") {
    return;
  }
  const { ctx, bbox } = u;
  const dpr = devicePixelRatio;
  const bottom = bbox.top + bbox.height;
  ctx.save();
  ctx.lineWidth = 1.5 * dpr;
  for (const firing of state.firings) {
    if (
      firing.time < state.viewRange.min ||
      firing.time > state.viewRange.max
    ) {
      continue;
    }
    const x = u.valToPos(firing.time, "x", true);
    ctx.strokeStyle = firing.color;
    ctx.beginPath();
    ctx.moveTo(x, bottom - FIRING_MARK_PX * dpr);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
  ctx.restore();
};

const drawPlayhead = (u: uPlot, time: number, range: TimeRange): void => {
  if (time < range.min || time > range.max) {
    return;
  }
  const dpr = devicePixelRatio;
  const x = u.valToPos(time, "x", true);
  const { ctx, bbox } = u;
  ctx.save();
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(x, bbox.top);
  ctx.lineTo(x, bbox.top + bbox.height);
  ctx.stroke();
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.moveTo(x - 5 * dpr, bbox.top);
  ctx.lineTo(x + 5 * dpr, bbox.top);
  ctx.lineTo(x, bbox.top + 6 * dpr);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const updateTooltip = (
  u: uPlot,
  tooltip: TooltipNodes,
  state: ChartState,
  focusedSeries: number,
): void => {
  const nodes = tooltip;
  const left = u.cursor.left;
  if (left == null || left < 0) {
    nodes.root.style.display = "none";
    return;
  }
  const time = u.posToVal(left, "x");
  const perPixel =
    (state.viewRange.max - state.viewRange.min) / u.over.clientWidth;
  const firing = findFiringNear(
    state.firings,
    time,
    FIRING_HOVER_PX * perPixel,
  );
  const series =
    focusedSeries >= 1 ? state.data.series[focusedSeries - 1] : undefined;
  const idx = u.cursor.idx;
  const value =
    series && idx != null && idx >= 0
      ? state.data.data[focusedSeries]?.[idx]
      : undefined;

  const showSeries = series !== undefined && state.data.kind !== "lanes";
  nodes.dot.style.display = showSeries ? "block" : "none";
  nodes.dot.style.background = series?.color ?? "";
  nodes.name.textContent = showSeries ? series.seriesName : "";
  nodes.value.textContent =
    showSeries && value != null ? String(Math.round(value * 1000) / 1000) : "";
  nodes.time.textContent = formatSeconds(time);
  nodes.firing.textContent = firing
    ? `${firing.transitionIds
        .map((id) => state.transitionNames.get(id) ?? id)
        .join(", ")} fired at ${formatSeconds(firing.time)}`
    : "";
  nodes.firing.style.color = firing?.color ?? "";

  nodes.root.style.display = "block";
  const width = nodes.root.offsetWidth;
  const overWidth = u.over.clientWidth;
  nodes.root.style.left = `${Math.max(0, Math.min(left - width / 2, overWidth - width))}px`;
  nodes.root.style.top = "4px";
};

/**
 * Zoom with the wheel around the pointer, pan by dragging, and view the time
 * under a click. All three go through the callbacks the chart was given, so
 * the view range is owned by React and the chart only reports.
 */
const attachInteractions = (
  u: uPlot,
  stateRef: RefObject<ChartState>,
): (() => void) => {
  const over = u.over;
  let press: { x: number; range: TimeRange; moved: boolean } | null = null;

  const timeAt = (clientX: number): number => {
    const rect = over.getBoundingClientRect();
    const { min, max } = stateRef.current.viewRange;
    return min + ((max - min) * (clientX - rect.left)) / rect.width;
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const { viewRange, domain, onViewRangeChange } = stateRef.current;
    const pivot = timeAt(event.clientX);
    const factor = Math.exp(event.deltaY * 0.002);
    const span = viewRange.max - viewRange.min;
    const next = clampRange(
      pivot - (pivot - viewRange.min) * factor,
      span * factor,
      domain,
    );
    onViewRangeChange(next);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    press = {
      x: event.clientX,
      range: stateRef.current.viewRange,
      moved: false,
    };
    over.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!press) {
      return;
    }
    const dx = event.clientX - press.x;
    if (!press.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) {
      return;
    }
    press.moved = true;
    const { domain, onViewRangeChange } = stateRef.current;
    const span = press.range.max - press.range.min;
    const shift = (-dx / over.clientWidth) * span;
    onViewRangeChange(clampRange(press.range.min + shift, span, domain));
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!press) {
      return;
    }
    if (!press.moved) {
      stateRef.current.onScrub(timeAt(event.clientX));
    }
    press = null;
    if (over.hasPointerCapture(event.pointerId)) {
      over.releasePointerCapture(event.pointerId);
    }
  };

  over.addEventListener("wheel", onWheel, { passive: false });
  over.addEventListener("pointerdown", onPointerDown);
  over.addEventListener("pointermove", onPointerMove);
  over.addEventListener("pointerup", onPointerUp);
  over.addEventListener("pointercancel", onPointerUp);
  return () => {
    over.removeEventListener("wheel", onWheel);
    over.removeEventListener("pointerdown", onPointerDown);
    over.removeEventListener("pointermove", onPointerMove);
    over.removeEventListener("pointerup", onPointerUp);
    over.removeEventListener("pointercancel", onPointerUp);
  };
};

/** How each data shape draws one series: marks, a step function, or a line. */
const seriesStyles: Record<
  EventTimelineData["kind"],
  (color: string) => Partial<uPlot.Series>
> = {
  lanes: (color) => ({
    paths: () => null,
    points: { show: true, size: 7, fill: color, stroke: color },
  }),
  steps: () => ({
    width: 2,
    paths: uPlot.paths.stepped!({ align: 1 }),
    points: { show: false },
  }),
  sampled: () => ({ width: 2, points: { show: false } }),
};

const buildSeries = (
  data: EventTimelineData,
  hiddenSeries: Set<string>,
): uPlot.Series[] => [
  { label: "Time" },
  ...data.series.map((series): uPlot.Series => ({
    label: series.seriesName,
    stroke: series.color,
    show: !hiddenSeries.has(series.seriesId),
    ...seriesStyles[data.kind](series.color),
  })),
];

const buildOptions = (
  data: EventTimelineData,
  hiddenSeries: Set<string>,
  size: { width: number; height: number },
  stateRef: RefObject<ChartState>,
  tooltip: TooltipNodes,
): uPlot.Options => {
  const laneLabels = data.kind === "lanes" ? data.laneLabels : null;
  // The series uPlot focuses under the pointer; it lives with the chart.
  let focusedSeries = -1;
  return {
    width: size.width,
    height: size.height,
    series: buildSeries(data, hiddenSeries),
    pxAlign: false,
    padding: [8, 8, 4, null],
    cursor: {
      lock: false,
      drag: { x: false, y: false, setScale: false },
      focus: { prox: 16 },
    },
    legend: { show: false },
    focus: { alpha: 0.3 },
    axes: [
      {
        side: 0,
        size: 26,
        font: "10px system-ui",
        stroke: "#475569",
        grid: { stroke: "#f3f4f6", width: 1 },
        ticks: { stroke: "#cbd5e1", width: 1, size: 6 },
        values: (_u, values) => values.map((value) => formatSeconds(value)),
      },
      laneLabels
        ? {
            size: 96,
            font: "10px system-ui",
            stroke: "#475569",
            grid: { stroke: "#f3f4f6", width: 1 },
            ticks: { show: false },
            splits: () => laneLabels.map((_, index) => index),
            values: (_u, splits) =>
              splits.map((split) => {
                const label = laneLabels[split] ?? "";
                return label.length > 14 ? `${label.slice(0, 13)}…` : label;
              }),
          }
        : {
            size: 54,
            font: "10px system-ui",
            stroke: "#999",
            grid: { stroke: "#f3f4f6", width: 1, dash: [4, 4] },
            ticks: { stroke: "#e5e7eb", width: 1 },
          },
    ],
    scales: {
      x: {
        time: false,
        range: () => {
          const { min, max } = stateRef.current.viewRange;
          return [min, max];
        },
      },
      y: laneLabels
        ? { range: () => [-0.6, laneLabels.length - 0.4] }
        : {
            auto: true,
            range: (_u, min, max) => [
              Math.min(0, min),
              Math.max(1, max * 1.05),
            ],
          },
    },
    hooks: {
      setSeries: [
        (u, seriesIndex) => {
          focusedSeries = seriesIndex ?? -1;
          updateTooltip(u, tooltip, stateRef.current, focusedSeries);
        },
      ],
      setCursor: [
        (u) => updateTooltip(u, tooltip, stateRef.current, focusedSeries),
      ],
      draw: [
        (u) => {
          drawReferences(u, stateRef.current);
          drawFirings(u, stateRef.current);
          drawPlayhead(u, stateRef.current.time, stateRef.current.viewRange);
        },
      ],
    },
  };
};

export const EventTimelineChart: FC<{
  data: EventTimelineData;
  firings: FiringMark[];
  /** Times of the reference frames recorded between firings. */
  references: readonly number[];
  transitionNames: ReadonlyMap<string, string>;
  hiddenSeries: Set<string>;
  viewRange: TimeRange;
  onViewRangeChange: (range: TimeRange) => void;
  /** The time the run covers: the view never pans past it. */
  domain: number;
  /** The viewed time, drawn as the playhead. */
  time: number;
  onScrub: (time: number) => void;
  className?: string;
  /** Hold the chart as it stands; updates apply together when it resumes. */
  paused?: boolean;
}> = ({
  data,
  firings,
  references,
  transitionNames,
  hiddenSeries,
  viewRange,
  onViewRangeChange,
  domain,
  time,
  onScrub,
  className,
  paused = false,
}) => {
  "use no memo"; // uPlot is driven imperatively through refs

  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const size = useElementSize(wrapperRef);
  const hasSize = size != null;

  const stateRef = useLatest<ChartState>({
    data,
    firings,
    references,
    transitionNames,
    viewRange,
    domain,
    time,
    onViewRangeChange,
    onScrub,
  });

  // One chart per data shape and series list; everything else updates it.
  // The data it starts from is read through the ref, which holds the render's
  // value by the time the effect runs, so a data update alone does not
  // rebuild the chart.
  const dataKind = data.kind;
  const dataSeries = data.series;
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !hasSize) {
      return;
    }
    const current = stateRef.current.data;
    const tooltip = createTooltip();
    const options = buildOptions(
      current,
      hiddenSeries,
      { width: wrapper.clientWidth, height: wrapper.clientHeight },
      stateRef,
      tooltip,
    );
    chartRef.current?.destroy();
    // eslint-disable-next-line new-cap -- uPlot's constructor is lowercase by convention
    const chart = new uPlot(options, current.data, wrapper);
    chartRef.current = chart;
    chart.over.appendChild(tooltip.root);
    const detach = attachInteractions(chart, stateRef);
    return () => {
      detach();
      chart.destroy();
      chartRef.current = null;
    };
  }, [dataKind, dataSeries, hiddenSeries, hasSize, stateRef]);

  useEffect(() => {
    if (chartRef.current && size && size.width > 0 && size.height > 0) {
      chartRef.current.setSize(size);
    }
  }, [size]);

  useEffect(() => {
    if (!paused) {
      chartRef.current?.setData(data.data, false);
      chartRef.current?.setScale("x", viewRange);
    }
  }, [data.data, paused, viewRange]);

  useEffect(() => {
    if (!paused) {
      chartRef.current?.redraw(false, false);
    }
  }, [time, firings, references, paused]);

  return <div ref={wrapperRef} className={className} />;
};
