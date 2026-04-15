import { css } from "@hashintel/ds-helpers/css";
import { use, useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { SegmentGroup } from "../../../../../components/segment-group";
import type { SubView } from "../../../../../components/sub-view/types";
import { useElementSize } from "../../../../../hooks/use-element-size";
import { useLatest } from "../../../../../hooks/use-latest";
import { useStableCallback } from "../../../../../hooks/use-stable-callback";
import { PlaybackContext } from "../../../../../playback/context";
import { SimulationContext } from "../../../../../simulation/context";
import {
  EditorContext,
  type TimelineChartType,
} from "../../../../../state/editor-context";
import { SDCPNContext } from "../../../../../state/sdcpn-context";

// -- Styles -------------------------------------------------------------------

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  paddingTop: "[4px]",
});

const chartAreaStyle = css({
  position: "relative",
  flex: "[1]",
  minHeight: "[0]",
});

const legendContainerStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "[12px]",
  fontSize: "[11px]",
  color: "[#666]",
  paddingY: "3",
  paddingX: "3",
});

const legendItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
  cursor: "pointer",
  userSelect: "none",
  transition: "[opacity 0.15s ease]",
  _hover: {
    opacity: 1,
  },
});

const legendColorStyle = css({
  width: "[10px]",
  height: "[10px]",
  borderRadius: "[2px]",
});

const tooltipStyle = css({
  position: "absolute",
  pointerEvents: "none",
  backgroundColor: "[rgba(0, 0, 0, 0.85)]",
  color: "neutral.s00",
  padding: "[6px 10px]",
  borderRadius: "md",
  fontSize: "[11px]",
  lineHeight: "[1.4]",
  zIndex: "[1000]",
  whiteSpace: "nowrap",
  boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.25)]",
  display: "none",
});

const tooltipLabelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const tooltipDotStyle = css({
  width: "[8px]",
  height: "[8px]",
  borderRadius: "[50%]",
  flexShrink: "[0]",
});

const tooltipValueStyle = css({
  fontWeight: "semibold",
  marginLeft: "[4px]",
});

// -- Constants ----------------------------------------------------------------

const DEFAULT_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
];

const CHART_TYPE_OPTIONS = [
  { value: "run", label: "Run" },
  { value: "stacked", label: "Stacked" },
];

// -- Types --------------------------------------------------------------------

/** Metadata for each place (stable across streaming updates). */
interface PlaceMeta {
  placeId: string;
  placeName: string;
  color: string;
}

// -- Header action ------------------------------------------------------------

const TimelineChartTypeSelector: React.FC = () => {
  const { timelineChartType: chartType, setTimelineChartType: setChartType } =
    use(EditorContext);

  return (
    <SegmentGroup
      value={chartType}
      options={CHART_TYPE_OPTIONS}
      onChange={(value) => setChartType(value as TimelineChartType)}
      size="sm"
    />
  );
};

// -- Streaming data hook (uPlot-native columnar format) -----------------------

/**
 * Streaming data store that builds uPlot columnar arrays directly.
 * New frames are pushed in O(k) where k = new frames, no full-array copies.
 */
interface StreamingStore {
  /** Place metadata (stable) */
  places: PlaceMeta[];
  /** Columnar arrays: [times, ...placeValues] — mutated in place */
  columns: number[][];
  /** Current frame count in the columns */
  length: number;
  /** Revision counter — incremented on every append to trigger React updates */
  revision: number;
}

function createEmptyStore(places: PlaceMeta[]): StreamingStore {
  return {
    places,
    columns: [[], ...places.map(() => [])],
    length: 0,
    revision: 0,
  };
}

/**
 * Hook that streams simulation frames directly into uPlot columnar arrays.
 * Returns a store ref (mutated in place) and a revision counter for React.
 */
function useStreamingData(): {
  store: StreamingStore;
  revision: number;
} {
  "use no memo"; // imperative streaming with refs

  const { getFramesInRange, totalFrames } = use(SimulationContext);
  const {
    petriNetDefinition: { places, types },
  } = use(SDCPNContext);

  const placeMeta: PlaceMeta[] = useMemo(
    () =>
      places.map((place, index) => {
        const tokenType = types.find((type) => type.id === place.colorId);
        return {
          placeId: place.id,
          placeName: place.name,
          color:
            tokenType?.displayColor ??
            DEFAULT_COLORS[index % DEFAULT_COLORS.length]!,
        };
      }),
    [places, types],
  );

  const storeRef = useRef<StreamingStore>(createEmptyStore(placeMeta));
  const processedRef = useRef(0);
  const [revision, setRevision] = useState(0);

  // Reset store if place structure changes
  useEffect(() => {
    storeRef.current = createEmptyStore(placeMeta);
    processedRef.current = 0;
    setRevision((r) => r + 1);
  }, [placeMeta]);

  // Stream new frames into the store
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      const store = storeRef.current;

      if (totalFrames === 0) {
        if (store.length > 0) {
          storeRef.current = createEmptyStore(store.places);
          processedRef.current = 0;
          setRevision((r) => r + 1);
        }
        return;
      }

      // Handle simulation restart
      if (totalFrames < processedRef.current) {
        storeRef.current = createEmptyStore(store.places);
        processedRef.current = 0;
        setRevision((r) => r + 1);
      }

      const startIndex = processedRef.current;
      if (startIndex >= totalFrames) {
        return;
      }

      const newFrames = await getFramesInRange(startIndex);
      if (cancelled || newFrames.length === 0) {
        return;
      }

      // Push new data directly into existing arrays — O(k) where k = new frames
      const cols = storeRef.current.columns;
      const timeCol = cols[0]!;
      const placeList = storeRef.current.places;

      for (const frame of newFrames) {
        timeCol.push(frame.time);
        for (let p = 0; p < placeList.length; p++) {
          const count = frame.places[placeList[p]!.placeId]?.count ?? 0;
          cols[p + 1]!.push(count);
        }
      }

      storeRef.current.length = timeCol.length;
      storeRef.current.revision++;
      processedRef.current = totalFrames;

      // Single state update to trigger React re-render
      setRevision((r) => r + 1);
    };

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [getFramesInRange, totalFrames, placeMeta]);

  return { store: storeRef.current, revision };
}

// -- uPlot data builders (from store, no copies for run chart) ----------------

function buildRunData(
  store: StreamingStore,
  hiddenPlaces: Set<string>,
): uPlot.AlignedData {
  const result: (number | null | undefined)[][] = [store.columns[0]!];
  for (let i = 0; i < store.places.length; i++) {
    if (hiddenPlaces.has(store.places[i]!.placeId)) {
      // Hidden series: array of nulls (uPlot skips nulls)
      result.push(new Array(store.length).fill(null));
    } else {
      // Visible series: direct reference to the column array (no copy!)
      result.push(store.columns[i + 1]!);
    }
  }
  return result as uPlot.AlignedData;
}

function buildStackedData(
  store: StreamingStore,
  hiddenPlaces: Set<string>,
): uPlot.AlignedData {
  const visible = store.places
    .map((p, i) => ({ ...p, colIdx: i + 1 }))
    .filter((p) => !hiddenPlaces.has(p.placeId));

  const cumulative = new Float64Array(store.length);
  const series: number[][] = [];

  for (const p of visible) {
    const col = store.columns[p.colIdx]!;
    const stacked = new Array<number>(store.length);
    for (let i = 0; i < store.length; i++) {
      cumulative[i]! += col[i] ?? 0;
      stacked[i] = cumulative[i]!;
    }
    series.push(stacked);
  }

  // Reverse so top band is first
  series.reverse();

  return [store.columns[0]!, ...series] as uPlot.AlignedData;
}

// -- Tooltip DOM (mutated imperatively in cursor hook — no React renders) -----

interface TooltipNodes {
  root: HTMLDivElement;
  dot: HTMLDivElement;
  name: HTMLSpanElement;
  value: HTMLSpanElement;
  time: HTMLDivElement;
  frame: HTMLDivElement;
}

function createTooltip(): TooltipNodes {
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

  const frame = document.createElement("div");
  frame.style.cssText = "font-size:9px;opacity:0.6;margin-top:2px";

  root.append(label, time, frame);

  return { root, dot, name, value, time, frame };
}

/**
 * Find which stacked band (place) contains the given y value at frame `idx`.
 * Walks visible places in stacking order, accumulating values until we exceed
 * the cursor's y. O(visible places) per call — trivial cost.
 */
function hitTestStackedBand(
  store: StreamingStore,
  hiddenPlaces: Set<string>,
  idx: number,
  yVal: number,
): { placeIdx: number; value: number } | null {
  if (yVal < 0) {
    return null;
  }
  let cumul = 0;
  for (let i = 0; i < store.places.length; i++) {
    if (hiddenPlaces.has(store.places[i]!.placeId)) {
      continue;
    }
    const v = store.columns[i + 1]![idx] ?? 0;
    cumul += v;
    if (yVal <= cumul) {
      return { placeIdx: i, value: v };
    }
  }
  return null;
}

// -- Hover target resolution (shared by tooltip) -----------------------------

interface HoverHit {
  place: PlaceMeta;
  value: number;
  idx: number;
  time: number;
}

/**
 * Resolve the place + value under the cursor. Returns null when there's
 * nothing to show (cursor outside data, no focused series, hidden place).
 */
function resolveHoverTarget(
  u: uPlot,
  store: StreamingStore,
  chartType: TimelineChartType,
  hiddenPlaces: Set<string>,
  focusedSeriesIdx: number,
): HoverHit | null {
  const idx = u.cursor.idx;
  if (idx == null || idx < 0 || store.length === 0) {
    return null;
  }

  let placeIdx: number;
  let value: number;

  if (chartType === "stacked") {
    const top = u.cursor.top;
    if (top == null || top < 0) {
      return null;
    }
    const hit = hitTestStackedBand(
      store,
      hiddenPlaces,
      idx,
      u.posToVal(top, "y"),
    );
    if (!hit) {
      return null;
    }
    placeIdx = hit.placeIdx;
    value = hit.value;
  } else {
    if (focusedSeriesIdx < 1) {
      return null;
    }
    placeIdx = focusedSeriesIdx - 1;
    if (hiddenPlaces.has(store.places[placeIdx]?.placeId ?? "")) {
      return null;
    }
    value = store.columns[focusedSeriesIdx]?.[idx] ?? 0;
  }

  const place = store.places[placeIdx];
  if (!place) {
    return null;
  }

  return { place, value, idx, time: store.columns[0]![idx] ?? 0 };
}

// -- Tooltip positioning (edge-clamped inside u.over) -------------------------

function positionTooltip(tooltip: TooltipNodes, u: uPlot, hit: HoverHit): void {
  // Local alias to satisfy no-param-reassign rule on DOM mutations.
  const t = tooltip;
  t.dot.style.background = hit.place.color;
  t.name.textContent = hit.place.placeName;
  t.value.textContent = String(hit.value);
  t.time.textContent = `${hit.time.toFixed(3)}s`;
  t.frame.textContent = `Frame ${hit.idx}`;

  // Measure after content update
  t.root.style.display = "block";
  const cx = u.cursor.left ?? 0;
  const cy = u.cursor.top ?? 0;
  const ow = u.over.clientWidth;
  const oh = u.over.clientHeight;
  const tw = t.root.offsetWidth;
  const th = t.root.offsetHeight;
  const margin = 10;

  let left = cx - tw / 2;
  if (left < 0) {
    left = 0;
  } else if (left + tw > ow) {
    left = ow - tw;
  }

  let top = cy - th - margin;
  if (top < 0) {
    top = Math.min(cy + margin, oh - th);
  }

  t.root.style.left = `${left}px`;
  t.root.style.top = `${top}px`;
}

// -- Playhead drawing (Logic Pro-style pin) -----------------------------------

/** Draw the playhead pin in the ruler and a vertical guide line into the chart. */
function drawPlayhead(u: uPlot, frameIdx: number): void {
  const times = u.data[0]!;
  if (times.length === 0) {
    return;
  }

  const dpr = devicePixelRatio;
  const time = times[Math.min(frameIdx, times.length - 1)]!;
  const cx = u.valToPos(time, "x", true);
  const plotTop = u.bbox.top;
  const plotHeight = u.bbox.height;
  const ctx = u.ctx;

  // Pin dimensions (all in physical pixels for HiDPI correctness)
  const headW = 12 * dpr;
  const rectH = 6 * dpr;
  const tipH = 6 * dpr;
  const radius = 3 * dpr;
  const tipY = plotTop;
  const baseY = tipY - tipH;
  const topY = baseY - rectH;
  const leftX = cx - headW / 2;
  const rightX = cx + headW / 2;

  ctx.save();

  // Pin head: rounded-top rectangle tapering to a triangular tip
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.moveTo(leftX, topY + radius);
  ctx.arcTo(leftX, topY, leftX + radius, topY, radius);
  ctx.lineTo(rightX - radius, topY);
  ctx.arcTo(rightX, topY, rightX, topY + radius, radius);
  ctx.lineTo(rightX, baseY);
  ctx.lineTo(cx, tipY);
  ctx.lineTo(leftX, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1 * dpr;
  ctx.stroke();

  // Vertical guide line
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(cx, tipY - 4 * dpr);
  ctx.lineTo(cx, tipY + plotHeight);
  ctx.stroke();

  ctx.restore();
}

// -- uPlot options builder ----------------------------------------------------

interface ChartOptions {
  /** Store value for structural config (series, bands). */
  store: StreamingStore;
  /** Ref to the latest store — tooltip hooks read this so they always
   *  see fresh data even if the store is replaced after a restart. */
  storeRef: React.RefObject<StreamingStore>;
  chartType: TimelineChartType;
  hiddenPlaces: Set<string>;
  size: { width: number; height: number };
  onScrub: (frameIndex: number) => void;
  getPlayheadFrame: () => number;
  tooltip: TooltipNodes;
}

function buildUPlotOptions(opts: ChartOptions): uPlot.Options {
  const {
    store,
    storeRef,
    chartType,
    hiddenPlaces,
    size,
    onScrub,
    getPlayheadFrame,
    tooltip: t,
  } = opts;

  // Mutable focus index — updated by setSeries hook, read by tooltip
  let focused = -1;

  const updateTooltip = (u: uPlot) => {
    // Read from ref so tooltip always sees the latest store, even after
    // simulation restart where the store object is replaced.
    const currentStore = storeRef.current;
    const hit = resolveHoverTarget(
      u,
      currentStore,
      chartType,
      hiddenPlaces,
      focused,
    );
    if (!hit) {
      t.root.style.display = "none";
      return;
    }
    positionTooltip(t, u, hit);
  };

  // Build series + bands config
  const series: uPlot.Series[] = [{ label: "Time" }];
  let bands: uPlot.Band[] | undefined;

  if (chartType === "stacked") {
    const visible = store.places
      .filter((p) => !hiddenPlaces.has(p.placeId))
      .reverse();
    for (const p of visible) {
      series.push({
        label: p.placeName,
        stroke: p.color,
        fill: `color-mix(in srgb, ${p.color} 53%, transparent)`,
        width: 2,
      });
    }
    // Bands clip each series' fill to the region between it and the series
    // below, preventing overlapping semi-transparent layers from compositing
    // into progressively darker/muddier colors.
    if (visible.length > 1) {
      bands = [];
      for (let i = 1; i < visible.length; i++) {
        bands.push({ series: [i, i + 1] as [number, number] });
      }
    }
  } else {
    for (const p of store.places) {
      series.push({
        label: p.placeName,
        stroke: p.color,
        width: 2,
        show: !hiddenPlaces.has(p.placeId),
      });
    }
  }

  return {
    width: size.width,
    height: size.height,
    series,
    bands,
    pxAlign: false,
    padding: [0, 8, 4, null],
    cursor: {
      lock: false,
      drag: { x: false, y: false, setScale: false },
      focus: { prox: 16 },
      bind: {
        mousedown: (u, _targ, handler) => (e: MouseEvent) => {
          handler(e);
          if (u.cursor.left != null && u.cursor.left >= 0) {
            onScrub(u.posToIdx(u.cursor.left));
          }
          return null;
        },
        mousemove: (u, _targ, handler) => (e: MouseEvent) => {
          handler(e);
          if (e.buttons === 1 && u.cursor.left != null && u.cursor.left >= 0) {
            onScrub(u.posToIdx(u.cursor.left));
          }
          return null;
        },
      },
    },
    legend: { show: false },
    focus: { alpha: chartType === "stacked" ? 1 : 0.3 },
    axes: [
      {
        show: true,
        side: 0,
        size: 26,
        font: "10px system-ui",
        stroke: "#475569",
        grid: { stroke: "#f3f4f6", width: 1 },
        ticks: { stroke: "#cbd5e1", width: 1, size: 6 },
        values: (_u, vals) => vals.map((v) => `${v}s`),
      },
      {
        show: true,
        size: 54,
        font: "10px system-ui",
        stroke: "#999",
        grid: { stroke: "#f3f4f6", width: 1, dash: [4, 4] },
        ticks: { stroke: "#e5e7eb", width: 1 },
      },
    ],
    scales: {
      x: { time: false, range: (_u, min, max) => [min, max] },
      y: {
        auto: true,
        range: (_u, min, max) => [Math.min(0, min), Math.max(1, max * 1.05)],
      },
    },
    hooks: {
      drawClear: [
        (u) => {
          const { ctx } = u;
          const { left: bx, width: bw, top: by } = u.bbox;
          const dpr = devicePixelRatio;
          ctx.save();
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = dpr;
          ctx.beginPath();
          ctx.moveTo(bx, by - 0.5 * dpr);
          ctx.lineTo(bx + bw, by - 0.5 * dpr);
          ctx.stroke();
          ctx.restore();
        },
      ],
      setSeries: [
        (u, sIdx) => {
          focused = sIdx ?? -1;
          updateTooltip(u);
        },
      ],
      setCursor: [(u) => updateTooltip(u)],
      draw: [(u) => drawPlayhead(u, getPlayheadFrame())],
    },
  };
}

// -- Ruler scrubbing (extracted from chart effect) ----------------------------

/**
 * Attaches pointer listeners on `u.root` to allow click/drag scrubbing on the
 * top axis (ruler) area. Returns a cleanup function.
 */
function attachRulerScrubbing(
  u: uPlot,
  onScrub: (frameIndex: number) => void,
): () => void {
  let dragging = false;
  let overRect: DOMRect | null = null;

  const onDown = (e: PointerEvent) => {
    overRect = u.over.getBoundingClientRect();
    if (e.clientY >= overRect.top) {
      return;
    }
    if (e.clientX < overRect.left || e.clientX > overRect.right) {
      return;
    }
    dragging = true;
    u.root.setPointerCapture(e.pointerId);
    const x = Math.max(0, Math.min(e.clientX - overRect.left, overRect.width));
    onScrub(u.posToIdx(x));
  };

  const onMove = (e: PointerEvent) => {
    if (dragging && overRect) {
      const x = Math.max(
        0,
        Math.min(e.clientX - overRect.left, overRect.width),
      );
      onScrub(u.posToIdx(x));
    }
  };

  const onUp = (e: PointerEvent) => {
    if (dragging) {
      dragging = false;
      u.root.releasePointerCapture(e.pointerId);
    }
  };

  u.root.addEventListener("pointerdown", onDown);
  u.root.addEventListener("pointermove", onMove);
  u.root.addEventListener("pointerup", onUp);
  u.root.addEventListener("pointercancel", onUp);

  return () => {
    u.root.removeEventListener("pointerdown", onDown);
    u.root.removeEventListener("pointermove", onMove);
    u.root.removeEventListener("pointerup", onUp);
    u.root.removeEventListener("pointercancel", onUp);
  };
}

// -- uPlot chart component ----------------------------------------------------

const UPlotChart: React.FC<{
  store: StreamingStore;
  chartType: TimelineChartType;
  hiddenPlaces: Set<string>;
  revision: number;
  totalFrames: number;
  currentFrameIndex: number;
  className?: string;
}> = ({
  store,
  chartType,
  hiddenPlaces,
  revision,
  totalFrames,
  currentFrameIndex,
  className,
}) => {
  "use no memo"; // imperative uPlot lifecycle
  const { setCurrentViewedFrame } = use(PlaybackContext);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const playheadFrameRef = useRef(currentFrameIndex);
  const storeRef = useLatest(store);

  // -- Derived state ----------------------------------------------------------

  // Reactive container size — replaces getBoundingClientRect + inline ResizeObserver
  const size = useElementSize(wrapperRef);
  // Boolean flag for the creation effect — triggers when size first becomes
  // available (null → non-null) without re-firing on every resize.
  const hasSize = size != null;

  // Stable identity: always calls the latest closure but never changes reference,
  // so it doesn't trigger chart recreation when totalFrames changes.
  const onScrub = useStableCallback((idx: number) => {
    setCurrentViewedFrame(Math.max(0, Math.min(idx, totalFrames - 1)));
  });

  // Columnar data from the store. Manual useMemo because we opted out of
  // React Compiler ("use no memo"), and buildStackedData allocates O(places ×
  // frames) per call. Without memoization it would recompute on every render
  // (e.g. every playback frame), and the result would be silently discarded
  // since Effect 3 only consumes it when `revision` changes.
  const data = useMemo(
    () =>
      chartType === "stacked"
        ? buildStackedData(store, hiddenPlaces)
        : buildRunData(store, hiddenPlaces),
    [revision, chartType, hiddenPlaces],
  );

  // -- Effect 1: create/destroy uPlot on structural changes -------------------

  useEffect(() => {
    // Note: parent (SimulationTimelineContent) gates on store.length === 0,
    // so this component only mounts once data is available.
    const wrapper = wrapperRef.current;
    if (!wrapper || !size) {
      return;
    }

    const tooltip = createTooltip();

    const opts = buildUPlotOptions({
      store,
      storeRef,
      chartType,
      hiddenPlaces,
      size,
      onScrub,
      getPlayheadFrame: () => playheadFrameRef.current,
      tooltip,
    });

    chartRef.current?.destroy();

    // eslint-disable-next-line new-cap -- uPlot's constructor is lowercase by convention
    const u = new uPlot(opts, data, wrapper);
    chartRef.current = u;

    // Mount tooltip inside u.over (the cursor overlay div). It positions
    // relative to that div and is bounded by its overflow:hidden — exactly
    // matching the chart area. Cleaned up automatically by u.destroy().
    u.over.appendChild(tooltip.root);

    const cleanupRuler = attachRulerScrubbing(u, onScrub);

    return () => {
      cleanupRuler();
      u.destroy();
      chartRef.current = null;
    };
    // Recreate only when chart type, visible series, or size availability changes.
    // onScrub is stable (useStableCallback). Subsequent size changes trigger
    // setSize (Effect 2), not recreation.
  }, [chartType, hiddenPlaces, store.places.length, hasSize]);

  // -- Effect 2: sync container size to existing chart ------------------------

  useEffect(() => {
    if (chartRef.current && size && size.width > 0 && size.height > 0) {
      chartRef.current.setSize(size);
    }
  }, [size]);

  // -- Effect 3: stream new data (no chart recreation) ------------------------

  useEffect(() => {
    chartRef.current?.setData(data);
  }, [revision]);

  // -- Effect 4: playhead redraw ---------------------------------------------

  useEffect(() => {
    playheadFrameRef.current = currentFrameIndex;
    chartRef.current?.redraw(false, false);
  }, [currentFrameIndex]);

  return <div ref={wrapperRef} className={className} />;
};

// -- Legend --------------------------------------------------------------------

const TimelineLegend: React.FC<{
  places: PlaceMeta[];
  hiddenPlaces: Set<string>;
  onToggleVisibility: (placeId: string) => void;
}> = ({ places, hiddenPlaces, onToggleVisibility }) => (
  <div className={legendContainerStyle}>
    {places.map((p) => {
      const isHidden = hiddenPlaces.has(p.placeId);

      return (
        <div
          key={p.placeId}
          role="button"
          tabIndex={0}
          className={legendItemStyle}
          onClick={() => onToggleVisibility(p.placeId)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggleVisibility(p.placeId);
            }
          }}
          style={{
            opacity: isHidden ? 0.4 : 1,
            textDecoration: isHidden ? "line-through" : "none",
          }}
        >
          <div
            className={legendColorStyle}
            style={{
              backgroundColor: p.color,
              opacity: isHidden ? 0.5 : 1,
            }}
          />
          <span>{p.placeName}</span>
        </div>
      );
    })}
  </div>
);

// -- Main component -----------------------------------------------------------

const SimulationTimelineContent: React.FC = () => {
  const { timelineChartType: chartType } = use(EditorContext);
  const { totalFrames } = use(SimulationContext);
  const { currentFrameIndex } = use(PlaybackContext);
  const { store, revision } = useStreamingData();

  const [hiddenPlaces, setHiddenPlaces] = useState<Set<string>>(new Set());

  const togglePlaceVisibility = (placeId: string) => {
    setHiddenPlaces((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) {
        next.delete(placeId);
      } else {
        next.add(placeId);
      }
      return next;
    });
  };

  if (store.length === 0 || totalFrames === 0) {
    return (
      <div className={containerStyle}>
        <span style={{ fontSize: 12, color: "#999" }}>
          No simulation data available
        </span>
      </div>
    );
  }

  return (
    <div className={containerStyle}>
      <UPlotChart
        className={chartAreaStyle}
        store={store}
        chartType={chartType}
        hiddenPlaces={hiddenPlaces}
        revision={revision}
        totalFrames={totalFrames}
        currentFrameIndex={currentFrameIndex}
      />
      <TimelineLegend
        places={store.places}
        hiddenPlaces={hiddenPlaces}
        onToggleVisibility={togglePlaceVisibility}
      />
    </div>
  );
};

/**
 * SubView definition for Simulation Timeline tab.
 */
export const simulationTimelineSubView: SubView = {
  id: "simulation-timeline",
  title: "Timeline",
  tooltip:
    "View the simulation timeline with compartment time-series. Click/drag to scrub through frames.",
  component: SimulationTimelineContent,
  renderHeaderAction: () => <TimelineChartTypeSelector />,
  noPadding: true,
};
