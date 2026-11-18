import { useEffect, useRef } from "react";
import uPlot from "uplot";

import { css } from "@hashintel/ds-helpers/css";

import { useElementSize } from "../../../../../../../react/hooks/use-element-size";
import "uplot/dist/uPlot.min.css";

import { useLatest } from "../../../../../../../react/hooks/use-latest";
import {
  describeRunPosition,
  formatRunPosition,
} from "../../../../shared/run-position";
import {
  tooltipDotStyle,
  tooltipLabelStyle,
  tooltipStyle,
  tooltipValueStyle,
} from "../simulation-timeline/styles";
import { formatTick, formatValue } from "./format";
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
  stackedBandAt,
  stackedBandValue,
  FIRING_COLOR,
  type EventTimelineData,
  type FiringMark,
} from "./series";

import type { TimeRange } from "./use-event-timeline-data";
import type { ReadableStore, RunClock } from "@hashintel/petrinaut-core";
import type { FC, RefObject } from "react";

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

/** A position in the tooltip: a time, or the step it falls in. */
const formatPosition = (clock: RunClock, position: number): string =>
  clock === "steps"
    ? describeRunPosition(clock, position)
    : `${formatRunPosition(clock, position)}s`;

/** A tick of the axis. A run in steps has ticks on whole steps only. */
const formatAxisPosition = (clock: RunClock, position: number): string =>
  clock === "steps" ? String(position) : formatPosition(clock, position);

/** Tick spacings of a run in steps: 1, 2 and 5 times each power of ten. */
const STEP_INCREMENTS = Array.from({ length: 10 }, (_, power) =>
  [1, 2, 5].map((multiple) => multiple * 10 ** power),
).flat();

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
  /** What a position on the time axis counts. */
  clock: RunClock;
  data: EventTimelineData;
  firings: readonly FiringMark[];
  references: readonly number[];
  transitionNames: ReadonlyMap<string, string>;
  viewRange: TimeRange;
  domain: number;
  /** The viewed time, read on every draw rather than rendered. */
  timeSource: ReadableStore<{ time: number }>;
  paused: boolean;
  onViewRangeChange: (range: TimeRange) => void;
  onScrub: (time: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
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
  ctx.strokeStyle = FIRING_COLOR;
  drawTicks(
    u,
    state.firings.map((firing) => firing.time),
    state.viewRange,
    FIRING_MARK_PX,
  );
  ctx.restore();
};

/**
 * The playhead: a line down the plot and a handle in the ruler whose tip sits
 * on the plot edge at exactly the viewed time. Hovering widens it with a
 * halo; dragging turns it the accent colour.
 */
const drawPlayhead = (
  u: uPlot,
  ctx: CanvasRenderingContext2D,
  state: ChartState,
  time: number,
  feel: PlayheadFeel,
): void => {
  const { viewRange } = state;
  if (time < viewRange.min || time > viewRange.max) {
    return;
  }
  const { bbox } = u;
  const dpr = devicePixelRatio;
  const x = u.valToPos(time, "x", true);
  const paint = ctx;
  const stripTop = bbox.top - RULER_PX * dpr;
  const bottom = bbox.top + bbox.height;
  const raised = feel.hover || feel.active;
  const color = feel.active ? ACCENT_COLOR : PLAYHEAD_COLOR;
  paint.save();
  if (raised) {
    paint.strokeStyle = feel.active
      ? "rgba(37, 99, 235, 0.18)"
      : "rgba(30, 41, 59, 0.12)";
    paint.lineWidth = 7 * dpr;
    paint.beginPath();
    paint.moveTo(x, stripTop);
    paint.lineTo(x, bottom);
    paint.stroke();
  }
  paint.strokeStyle = color;
  paint.lineWidth = (raised ? 2 : 1.5) * dpr;
  paint.beginPath();
  paint.moveTo(x, bbox.top);
  paint.lineTo(x, bottom);
  paint.stroke();

  const half = (raised ? 6 : 5) * dpr;
  const top = stripTop + 4 * dpr;
  const shoulder = bbox.top - 6 * dpr;
  paint.fillStyle = color;
  paint.beginPath();
  paint.moveTo(x - half, top);
  paint.lineTo(x + half, top);
  paint.lineTo(x + half, shoulder);
  paint.lineTo(x, bbox.top);
  paint.lineTo(x - half, shoulder);
  paint.closePath();
  paint.fill();
  paint.restore();
};

type Overlay = {
  draw: () => void;
  resize: () => void;
  dispose: () => void;
};

const overlayStyle = css({
  position: "absolute",
  top: "[0]",
  left: "[0]",
  pointerEvents: "none",
});

/**
 * A second canvas over uPlot's for what moves without the data moving: the
 * playhead. The viewed time drives it through a store subscription, so a
 * frame of playback costs a clear and a few strokes, with no React render
 * and no redraw of the series. It also writes the host's slider value for
 * assistive technology, and is the only thing that does.
 */
const createOverlay = (
  u: uPlot,
  stateRef: RefObject<ChartState>,
  getFeel: () => PlayheadFeel,
  host: HTMLElement | null,
): Overlay => {
  const wrap = u.over.parentElement ?? u.root;
  const canvas = document.createElement("canvas");
  canvas.className = overlayStyle;
  // Under uPlot's own overlay, so the cursor and the tooltip stay on top.
  wrap.insertBefore(canvas, u.over);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("The timeline overlay could not get a 2D context");
  }
  const resize = () => {
    const dpr = devicePixelRatio;
    canvas.width = Math.round(u.width * dpr);
    canvas.height = Math.round(u.height * dpr);
    canvas.style.width = `${u.width}px`;
    canvas.style.height = `${u.height}px`;
  };
  const draw = () => {
    const state = stateRef.current;
    const time = state.timeSource.get().time;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPlayhead(u, ctx, state, time, getFeel());
    host?.setAttribute("aria-valuenow", String(time));
    host?.setAttribute(
      "aria-valuetext",
      describeRunPosition(state.clock, time),
    );
  };
  resize();
  return { draw, resize, dispose: () => canvas.remove() };
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
  const idx = u.cursor.idx;
  const stacked = state.data.kind !== "lanes" && state.data.stacked === true;
  // In a stacked chart the pointer names the band it is inside, which is
  // not always the one whose edge is nearest.
  const seriesIndex =
    stacked && idx != null && idx >= 0 && u.cursor.top != null
      ? (stackedBandAt(state.data.data, idx, u.posToVal(u.cursor.top, "y")) ??
        0)
      : focusedSeries;
  const series =
    seriesIndex >= 1 ? state.data.series[seriesIndex - 1] : undefined;
  // A stacked band shows what it holds itself, not the height it reaches.
  const value =
    !series || idx == null || idx < 0
      ? undefined
      : stacked
        ? stackedBandValue(state.data.data, seriesIndex, idx)
        : state.data.data[seriesIndex]?.[idx];

  const showSeries = series !== undefined && state.data.kind !== "lanes";
  nodes.dot.style.display = showSeries ? "block" : "none";
  nodes.dot.style.background = series?.color ?? "";
  nodes.name.textContent = showSeries ? series.seriesName : "";
  nodes.value.textContent =
    showSeries && value != null ? formatValue(value) : "";
  nodes.time.textContent = formatPosition(state.clock, time);
  nodes.firing.textContent = firing
    ? `${firing.transitionIds
        .map((id) => state.transitionNames.get(id) ?? id)
        .join(", ")} fired at ${formatPosition(state.clock, firing.time)}`
    : "";

  nodes.root.style.display = "block";
  const width = nodes.root.offsetWidth;
  const overWidth = u.over.clientWidth;
  nodes.root.style.left = `${Math.max(0, Math.min(left - width / 2, overWidth - width))}px`;
  nodes.root.style.top = "4px";
};

/**
 * The gestures: a press anywhere in the chart views that time and a drag
 * scrubs, a grabbed playhead keeps its place under the pointer, scrolling
 * sideways pans, and pinch or the wheel zooms about the pointer. Every
 * change goes through the callbacks the chart was given, so the view range
 * and the viewed time are owned by React.
 */
const attachInteractions = (
  u: uPlot,
  stateRef: RefObject<ChartState>,
  publishFeel: (feel: PlayheadFeel) => void,
  drawOverlay: () => void,
): (() => void) => {
  const root = u.root;
  /**
   * The drag in progress: how far the viewed time sat from the pointer when
   * it began, which is zero unless the playhead itself was grabbed.
   */
  let scrubOffset: number | null = null;
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
      playheadX:
        plot.left + u.valToPos(stateRef.current.timeSource.get().time, "x"),
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
    drawOverlay();
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
    const grabbed = zone === "playhead";
    scrubOffset = grabbed ? stateRef.current.timeSource.get().time - time : 0;
    setFeel({ active: true });
    root.style.cursor = "ew-resize";
    stateRef.current.onScrubStart();
    if (!grabbed) {
      stateRef.current.onScrub(time);
    }
    drawOverlay();
  };

  const onPointerMove = (event: PointerEvent) => {
    const point = pointAt(event);
    if (scrubOffset === null) {
      settleHover(point);
      if (hoverZone === "ruler" || hoverZone === "playhead") {
        // The ruler lies outside uPlot's own cursor area; drive it so the
        // tooltip names the firing under the pointer there too.
        u.setCursor({ left: point.x - plotBox(u).left, top: 0 });
      }
      return;
    }
    stateRef.current.onScrub(
      Math.min(
        Math.max(timeAt(point.x) + scrubOffset, 0),
        stateRef.current.domain,
      ),
    );
  };

  // A released and a cancelled press end the drag alike: the time it viewed
  // was set as it moved.
  const onPointerEnd = (event: PointerEvent) => {
    if (scrubOffset === null) {
      return;
    }
    scrubOffset = null;
    setFeel({ active: false });
    stateRef.current.onScrubEnd();
    if (root.hasPointerCapture(event.pointerId)) {
      root.releasePointerCapture(event.pointerId);
    }
    hoverZone = "outside";
    settleHover(pointAt(event));
    drawOverlay();
  };

  const onPointerLeave = () => {
    if (scrubOffset !== null) {
      return;
    }
    hoverZone = "outside";
    setFeel({ hover: false });
    root.style.cursor = "";
    u.setCursor({ left: -10, top: -10 });
    drawOverlay();
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
  root.addEventListener("pointerup", onPointerEnd);
  root.addEventListener("pointercancel", onPointerEnd);
  root.addEventListener("pointerleave", onPointerLeave);
  return () => {
    root.removeEventListener("wheel", onWheel);
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerup", onPointerEnd);
    root.removeEventListener("pointercancel", onPointerEnd);
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

const isStacked = (data: EventTimelineData): boolean =>
  data.kind !== "lanes" && data.stacked === true;

const buildSeries = (
  data: EventTimelineData,
  hiddenSeries: Set<string>,
): uPlot.Series[] => [
  { label: "Time" },
  ...data.series.map((series): uPlot.Series => ({
    label: series.seriesName,
    stroke: series.color,
    // A stacked chart is given its visible series only.
    show: isStacked(data) || !hiddenSeries.has(series.seriesId),
    ...seriesStyles[data.kind](series.color),
    ...(isStacked(data)
      ? { fill: `color-mix(in srgb, ${series.color} 53%, transparent)` }
      : {}),
  })),
];

/** Each band fills down to the one drawn after it, the bottom one to zero. */
const buildBands = (data: EventTimelineData): uPlot.Band[] | undefined =>
  isStacked(data) && data.series.length > 1
    ? data.series
        .slice(1)
        .map((_, index): uPlot.Band => ({ series: [index + 1, index + 2] }))
    : undefined;

const buildOptions = (
  data: EventTimelineData,
  hiddenSeries: Set<string>,
  size: { width: number; height: number },
  stateRef: RefObject<ChartState>,
  tooltip: TooltipNodes,
  getOverlay: () => Overlay | null,
): uPlot.Options => {
  const laneLabels = data.kind === "lanes" ? data.laneLabels : null;
  // The series uPlot focuses under the pointer; it lives with the chart.
  let focusedSeries = -1;
  return {
    width: size.width,
    height: size.height,
    series: buildSeries(data, hiddenSeries),
    bands: buildBands(data),
    pxAlign: false,
    padding: [8, 8, 4, null],
    cursor: {
      lock: false,
      drag: { x: false, y: false, setScale: false },
      focus: { prox: 16 },
    },
    legend: { show: false },
    // Dimming the bands around the focused one would show through them.
    focus: { alpha: isStacked(data) ? 1 : 0.3 },
    axes: [
      {
        side: 0,
        size: AXIS_PX,
        gap: LABEL_GAP_PX,
        font: "10px system-ui",
        stroke: "#475569",
        grid: { stroke: "#f3f4f6", width: 1 },
        ticks: { show: false },
        ...(stateRef.current.clock === "steps"
          ? { incrs: STEP_INCREMENTS }
          : {}),
        values: (_u, values) =>
          values.map((value) =>
            formatAxisPosition(stateRef.current.clock, value),
          ),
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
            values: (_u, splits, _axis, _space, increment) =>
              splits.map((split) => formatTick(split, increment)),
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
            range: (_u, min, max) => {
              const current = stateRef.current.data;
              const atLeast =
                current.kind === "steps" ? (current.axisMinimum ?? 1) : 1;
              return [Math.min(0, min), Math.max(atLeast, max * 1.05)];
            },
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
      setSize: [() => getOverlay()?.resize()],
      draw: [
        (u) => {
          const state = stateRef.current;
          drawRuler(u);
          drawReferences(u, state);
          drawFirings(u, state);
          // The series moved under the overlay: zoom, pan or new data.
          getOverlay()?.draw();
        },
      ],
    },
  };
};

const hostStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
  outline: "none",
  userSelect: "none",
  _focusVisible: {
    boxShadow: "[inset 0 0 0 2px rgba(37, 99, 235, 0.35)]",
  },
});

export const EventTimelineChart: FC<{
  /** What a position on the time axis counts: seconds, or steps. */
  clock: RunClock;
  data: EventTimelineData;
  firings: readonly FiringMark[];
  /** Times of the reference frames recorded between firings. */
  references: readonly number[];
  transitionNames: ReadonlyMap<string, string>;
  hiddenSeries: Set<string>;
  viewRange: TimeRange;
  onViewRangeChange: (range: TimeRange) => void;
  /** The time the run covers: the view never pans past it. */
  domain: number;
  /**
   * The viewed time. The chart subscribes to it and moves the playhead on
   * an overlay canvas, so a frame of playback never renders this component.
   */
  timeSource: ReadableStore<{ time: number }>;
  onScrub: (time: number) => void;
  /** Called as a drag begins and ends. */
  onScrubStart: () => void;
  onScrubEnd: () => void;
  /** What an arrow key does while the chart has focus. */
  onStep: (direction: -1 | 1) => void;
  /** Home and End jump to the start and to the live edge. */
  onJump: (edge: "start" | "end") => void;
  className?: string;
  /** Hold the chart as it stands; updates apply together when it resumes. */
  paused?: boolean;
}> = ({
  clock,
  data,
  firings,
  references,
  transitionNames,
  hiddenSeries,
  viewRange,
  onViewRangeChange,
  domain,
  timeSource,
  onScrub,
  onScrubStart,
  onScrubEnd,
  onStep,
  onJump,
  className,
  paused = false,
}) => {
  "use no memo"; // uPlot is driven imperatively through refs

  const hostRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const size = useElementSize(wrapperRef);
  const hasSize = size != null;

  const stateRef = useLatest<ChartState>({
    clock,
    data,
    firings,
    references,
    transitionNames,
    viewRange,
    domain,
    timeSource,
    paused,
    onViewRangeChange,
    onScrub,
    onScrubStart,
    onScrubEnd,
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowLeft":
        onStep(-1);
        break;
      case "ArrowRight":
        onStep(1);
        break;
      case "Home":
        onJump("start");
        break;
      case "End":
        onJump("end");
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // One chart per clock, data shape and series list; everything else
  // updates it.
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
    // How the playhead is being handled; the gestures write it, the overlay
    // reads it.
    let feel: PlayheadFeel = { hover: false, active: false };
    // The chart's hooks reach the overlay through this holder: it exists
    // only once the chart does.
    const overlayHolder: { current: Overlay | null } = { current: null };
    const options = buildOptions(
      current,
      hiddenSeries,
      { width: wrapper.clientWidth, height: wrapper.clientHeight },
      stateRef,
      tooltip,
      () => overlayHolder.current,
    );
    chartRef.current?.destroy();
    // eslint-disable-next-line new-cap -- uPlot's constructor is lowercase by convention
    const chart = new uPlot(options, current.data, wrapper);
    chartRef.current = chart;
    chart.over.appendChild(tooltip.root);
    const overlay = createOverlay(chart, stateRef, () => feel, hostRef.current);
    overlayHolder.current = overlay;
    overlayRef.current = overlay;
    overlay.draw();
    const detach = attachInteractions(
      chart,
      stateRef,
      (next) => {
        feel = next;
      },
      () => overlay.draw(),
    );
    return () => {
      detach();
      overlay.dispose();
      overlayRef.current = null;
      chart.destroy();
      chartRef.current = null;
    };
  }, [clock, dataKind, dataSeries, hiddenSeries, hasSize, stateRef]);

  // The playhead follows the viewed time through the store, not a render.
  useEffect(
    () =>
      timeSource.subscribe(() => {
        if (!stateRef.current.paused) {
          overlayRef.current?.draw();
        }
      }),
    [stateRef, timeSource],
  );

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
  }, [firings, references, paused]);

  // Whatever moved the playhead while the chart was held is drawn on resume.
  useEffect(() => {
    if (!paused) {
      overlayRef.current?.draw();
    }
  }, [paused]);

  return (
    <div
      ref={hostRef}
      className={hostStyle}
      role="slider"
      tabIndex={0}
      aria-label="Timeline"
      aria-valuemin={0}
      aria-valuemax={domain}
      // Where the value starts; the overlay keeps it current from then on.
      aria-valuenow={0}
      onKeyDown={onKeyDown}
    >
      <div ref={wrapperRef} className={className} />
    </div>
  );
};
