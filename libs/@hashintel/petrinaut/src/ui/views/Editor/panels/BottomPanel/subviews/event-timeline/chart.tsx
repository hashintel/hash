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
  classifyWheel,
  hitTest,
  panRange,
  zoomRange,
  type HitZone,
  type PlotBox,
} from "./interactions";
import {
  findFiringNear,
  type EventTimelineData,
  type FiringMark,
} from "./series";

import type { TimeRange } from "./use-event-timeline-data";
import type { FC, RefObject } from "react";

/** Pixels the pointer may move before a press in the plot becomes a selection. */
const DRAG_THRESHOLD_PX = 3;
/** Pixels around the pointer within which a firing mark is the hovered one. */
const FIRING_HOVER_PX = 6;
/** Pixels either side of the playhead line that grab it. */
const PLAYHEAD_GRAB_PX = 6;

/**
 * The time axis sits above the plot: its labels, then a ruler strip against
 * the plot edge that carries the event marks and the playhead handle. The
 * whole axis scrubs when dragged.
 */
const AXIS_PX = 42;
const RULER_PX = 24;
/** Keeps the labels above the strip: uPlot draws them this far from the plot. */
const LABEL_GAP_PX = RULER_PX + 2;
const FIRING_MARK_PX = 9;
const REFERENCE_MARK_PX = 4;

const PLAYHEAD_COLOR = "#1e293b";
const ACCENT_COLOR = "#2563eb";

const formatSeconds = (time: number): string => `${time.toFixed(3)}s`;

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
  selection: TimeRange | null;
  onViewRangeChange: (range: TimeRange) => void;
  onScrub: (time: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onSelectionChange: (range: TimeRange | null) => void;
};

/** How the playhead is being handled, for its hover and drag feedback. */
type PlayheadFeel = { hover: boolean; active: boolean };

/** The plot area in CSS pixels, relative to the chart's root. */
const plotBox = (u: uPlot): PlotBox => {
  const dpr = devicePixelRatio;
  return {
    left: u.bbox.left / dpr,
    top: u.bbox.top / dpr,
    width: u.bbox.width / dpr,
    height: u.bbox.height / dpr,
  };
};

const drawRuler = (u: uPlot): void => {
  const { ctx, bbox } = u;
  const dpr = devicePixelRatio;
  ctx.save();
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(
    bbox.left,
    bbox.top - RULER_PX * dpr,
    bbox.width,
    RULER_PX * dpr,
  );
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.moveTo(bbox.left, bbox.top - dpr / 2);
  ctx.lineTo(bbox.left + bbox.width, bbox.top - dpr / 2);
  ctx.stroke();
  ctx.restore();
};

/** The selected range: a band over the plot and a bar along the ruler. */
const drawSelection = (u: uPlot, state: ChartState): void => {
  if (!state.selection) {
    return;
  }
  const min = Math.max(state.selection.min, state.viewRange.min);
  const max = Math.min(state.selection.max, state.viewRange.max);
  if (max <= min) {
    return;
  }
  const { ctx, bbox } = u;
  const dpr = devicePixelRatio;
  const x0 = u.valToPos(min, "x", true);
  const x1 = u.valToPos(max, "x", true);
  ctx.save();
  ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
  ctx.fillRect(x0, bbox.top, x1 - x0, bbox.height);
  ctx.fillStyle = "rgba(37, 99, 235, 0.3)";
  ctx.fillRect(x0, bbox.top - RULER_PX * dpr, x1 - x0, 3 * dpr);
  ctx.strokeStyle = "rgba(37, 99, 235, 0.45)";
  ctx.lineWidth = dpr;
  ctx.beginPath();
  for (const edge of [state.selection.min, state.selection.max]) {
    if (edge >= state.viewRange.min && edge <= state.viewRange.max) {
      const x = u.valToPos(edge, "x", true);
      ctx.moveTo(x, bbox.top);
      ctx.lineTo(x, bbox.top + bbox.height);
    }
  }
  ctx.stroke();
  ctx.restore();
};

/** Ticks up from the plot edge into the ruler, one per time in view. */
const drawTicks = (
  u: uPlot,
  times: Iterable<number>,
  range: TimeRange,
  height: number,
): void => {
  const { ctx, bbox } = u;
  const dpr = devicePixelRatio;
  ctx.beginPath();
  for (const time of times) {
    if (time < range.min || time > range.max) {
      continue;
    }
    const x = u.valToPos(time, "x", true);
    ctx.moveTo(x, bbox.top - height * dpr);
    ctx.lineTo(x, bbox.top);
  }
  ctx.stroke();
};

/**
 * Reference frames as faint ticks: a hint that the state there was recorded
 * rather than interpolated. They are not stepped to.
 */
const drawReferences = (u: uPlot, state: ChartState): void => {
  const { ctx } = u;
  ctx.save();
  ctx.lineWidth = devicePixelRatio;
  ctx.strokeStyle = "rgba(100, 116, 139, 0.35)";
  drawTicks(u, state.references, state.viewRange, REFERENCE_MARK_PX);
  ctx.restore();
};

const drawFirings = (u: uPlot, state: ChartState): void => {
  const { ctx } = u;
  ctx.save();
  ctx.lineWidth = 1.5 * devicePixelRatio;
  for (const firing of state.firings) {
    ctx.strokeStyle = firing.color;
    drawTicks(u, [firing.time], state.viewRange, FIRING_MARK_PX);
  }
  ctx.restore();
};

/**
 * The playhead: a line down the plot and a handle in the ruler whose tip sits
 * on the plot edge at exactly the viewed time. Hovering widens it with a
 * halo; dragging turns it the accent colour.
 */
const drawPlayhead = (
  u: uPlot,
  state: ChartState,
  feel: PlayheadFeel,
): void => {
  const { time, viewRange } = state;
  if (time < viewRange.min || time > viewRange.max) {
    return;
  }
  const { ctx, bbox } = u;
  const dpr = devicePixelRatio;
  const x = u.valToPos(time, "x", true);
  const stripTop = bbox.top - RULER_PX * dpr;
  const bottom = bbox.top + bbox.height;
  const raised = feel.hover || feel.active;
  const color = feel.active ? ACCENT_COLOR : PLAYHEAD_COLOR;
  ctx.save();
  if (raised) {
    ctx.strokeStyle = feel.active
      ? "rgba(37, 99, 235, 0.18)"
      : "rgba(30, 41, 59, 0.12)";
    ctx.lineWidth = 7 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, stripTop);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = (raised ? 2 : 1.5) * dpr;
  ctx.beginPath();
  ctx.moveTo(x, bbox.top);
  ctx.lineTo(x, bottom);
  ctx.stroke();

  const half = (raised ? 6 : 5) * dpr;
  const top = stripTop + 4 * dpr;
  const shoulder = bbox.top - 6 * dpr;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - half, top);
  ctx.lineTo(x + half, top);
  ctx.lineTo(x + half, shoulder);
  ctx.lineTo(x, bbox.top);
  ctx.lineTo(x - half, shoulder);
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

/** A press in progress, from the pointer down until it is released. */
type Press =
  /** Dragging the playhead or the ruler; `offset` keeps a grabbed handle under the pointer. */
  | { kind: "scrub"; offset: number }
  /** Pressed in the plot, not yet moved far enough to count as a selection. */
  | { kind: "pending"; x: number; time: number }
  | { kind: "select"; anchor: number };

/**
 * The gestures, in the grammar of audio and video editors: the ruler and the
 * playhead scrub, a drag in the plot selects a range, a click views that
 * time, scrolling pans and pinch or the wheel zooms about the pointer. Every
 * change goes through the callbacks the chart was given, so the view range,
 * the selection and the viewed time are owned by React.
 */
const attachInteractions = (
  u: uPlot,
  stateRef: RefObject<ChartState>,
  publishFeel: (feel: PlayheadFeel) => void,
): (() => void) => {
  const root = u.root;
  let press: Press | null = null;
  let hoverZone: HitZone = "outside";
  let feel: PlayheadFeel = { hover: false, active: false };
  const setFeel = (next: Partial<PlayheadFeel>) => {
    feel = { ...feel, ...next };
    publishFeel(feel);
  };

  const pointAt = (event: { clientX: number; clientY: number }) => {
    const rect = root.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const timeAt = (x: number): number => {
    const time = u.posToVal(x - plotBox(u).left, "x");
    return Math.min(Math.max(time, 0), stateRef.current.domain);
  };
  const zoneAt = (point: { x: number; y: number }): HitZone => {
    const plot = plotBox(u);
    return hitTest({
      ...point,
      plot,
      rulerHeight: AXIS_PX,
      playheadX: plot.left + u.valToPos(stateRef.current.time, "x"),
      grab: PLAYHEAD_GRAB_PX,
    });
  };
  const cursorFor = (zone: HitZone): string =>
    zone === "playhead" || zone === "ruler" ? "ew-resize" : "";
  const settleHover = (point: { x: number; y: number }) => {
    const zone = zoneAt(point);
    if (zone === hoverZone) {
      return;
    }
    hoverZone = zone;
    setFeel({ hover: zone === "playhead" });
    root.style.cursor = cursorFor(zone);
    u.redraw(false, false);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    const point = pointAt(event);
    const zone = zoneAt(point);
    if (zone === "outside") {
      return;
    }
    root.setPointerCapture(event.pointerId);
    const time = timeAt(point.x);
    if (zone === "playhead" || zone === "ruler") {
      press = {
        kind: "scrub",
        offset: zone === "playhead" ? stateRef.current.time - time : 0,
      };
      setFeel({ active: true });
      root.style.cursor = "ew-resize";
      stateRef.current.onScrubStart();
      if (zone === "ruler") {
        stateRef.current.onScrub(time);
      }
      u.redraw(false, false);
      return;
    }
    press = { kind: "pending", x: point.x, time };
  };

  const onPointerMove = (event: PointerEvent) => {
    const point = pointAt(event);
    if (!press) {
      settleHover(point);
      if (hoverZone === "ruler" || hoverZone === "playhead") {
        // The ruler lies outside uPlot's own cursor area; drive it so the
        // tooltip names the firing under the pointer there too.
        u.setCursor({ left: point.x - plotBox(u).left, top: 0 });
      }
      return;
    }
    const time = timeAt(point.x);
    if (press.kind === "scrub") {
      stateRef.current.onScrub(
        Math.min(Math.max(time + press.offset, 0), stateRef.current.domain),
      );
      return;
    }
    if (press.kind === "pending") {
      if (Math.abs(point.x - press.x) < DRAG_THRESHOLD_PX) {
        return;
      }
      press = { kind: "select", anchor: press.time };
      root.style.cursor = "crosshair";
    }
    stateRef.current.onSelectionChange({
      min: Math.min(press.anchor, time),
      max: Math.max(press.anchor, time),
    });
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!press) {
      return;
    }
    const point = pointAt(event);
    if (press.kind === "scrub") {
      setFeel({ active: false });
      stateRef.current.onScrubEnd();
    } else if (press.kind === "pending") {
      // A click: view that time, and let go of any selection.
      stateRef.current.onSelectionChange(null);
      stateRef.current.onScrub(timeAt(point.x));
    }
    press = null;
    if (root.hasPointerCapture(event.pointerId)) {
      root.releasePointerCapture(event.pointerId);
    }
    hoverZone = "outside";
    settleHover(point);
    u.redraw(false, false);
  };

  const onPointerLeave = () => {
    if (press) {
      return;
    }
    hoverZone = "outside";
    setFeel({ hover: false });
    root.style.cursor = "";
    u.setCursor({ left: -10, top: -10 });
    u.redraw(false, false);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const { viewRange, domain, onViewRangeChange } = stateRef.current;
    const gesture = classifyWheel(event);
    if (gesture.kind === "zoom") {
      const pivot = timeAt(pointAt(event).x);
      onViewRangeChange(zoomRange(viewRange, gesture.factor, pivot, domain));
      return;
    }
    const secondsPerPixel = (viewRange.max - viewRange.min) / plotBox(u).width;
    onViewRangeChange(
      panRange(viewRange, gesture.pixels * secondsPerPixel, domain),
    );
  };

  root.addEventListener("wheel", onWheel, { passive: false });
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerUp);
  root.addEventListener("pointerleave", onPointerLeave);
  return () => {
    root.removeEventListener("wheel", onWheel);
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerup", onPointerUp);
    root.removeEventListener("pointercancel", onPointerUp);
    root.removeEventListener("pointerleave", onPointerLeave);
    root.style.cursor = "";
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
  getFeel: () => PlayheadFeel,
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
        size: AXIS_PX,
        gap: LABEL_GAP_PX,
        font: "10px system-ui",
        stroke: "#475569",
        grid: { stroke: "#f3f4f6", width: 1 },
        ticks: { show: false },
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
          const state = stateRef.current;
          drawRuler(u);
          drawSelection(u, state);
          drawReferences(u, state);
          drawFirings(u, state);
          drawPlayhead(u, state, getFeel());
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
  /** Called as a drag of the playhead or the ruler begins and ends. */
  onScrubStart: () => void;
  onScrubEnd: () => void;
  /** The selected range, drawn as a band; null when nothing is selected. */
  selection: TimeRange | null;
  onSelectionChange: (range: TimeRange | null) => void;
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
  onScrubStart,
  onScrubEnd,
  selection,
  onSelectionChange,
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
    selection,
    onViewRangeChange,
    onScrub,
    onScrubStart,
    onScrubEnd,
    onSelectionChange,
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
    // How the playhead is being handled; the gestures write it, the draw
    // hook reads it.
    let feel: PlayheadFeel = { hover: false, active: false };
    const options = buildOptions(
      current,
      hiddenSeries,
      { width: wrapper.clientWidth, height: wrapper.clientHeight },
      stateRef,
      tooltip,
      () => feel,
    );
    chartRef.current?.destroy();
    // eslint-disable-next-line new-cap -- uPlot's constructor is lowercase by convention
    const chart = new uPlot(options, current.data, wrapper);
    chartRef.current = chart;
    chart.over.appendChild(tooltip.root);
    const detach = attachInteractions(chart, stateRef, (next) => {
      feel = next;
    });
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
  }, [time, firings, references, selection, paused]);

  return <div ref={wrapperRef} className={className} />;
};
