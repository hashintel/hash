import { css } from "@hashintel/ds-helpers/css";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { SegmentGroup } from "../../../../../components/segment-group";
import type { SubView } from "../../../../../components/sub-view/types";
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

const chartWrapperStyle = css({
  position: "absolute",
  inset: "[0]",
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
  }, [getFramesInRange, totalFrames]);

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

// -- uPlot options builder ----------------------------------------------------

function buildUPlotOptions(
  store: StreamingStore,
  chartType: TimelineChartType,
  hiddenPlaces: Set<string>,
  width: number,
  height: number,
  onScrub: (frameIndex: number) => void,
  getPlayheadFrame: () => number,
  tooltip: TooltipNodes,
): uPlot.Options {
  // Tracks the focused series index for run-mode tooltip (set via setSeries hook).
  // For stacked mode we hit-test the y position instead.
  const focused = { current: -1 };

  // Local alias so the no-param-reassign rule doesn't fire on every mutation.
  const t = tooltip;

  const updateTooltip = (u: uPlot) => {
    const idx = u.cursor.idx;
    if (idx == null || idx < 0 || store.length === 0) {
      t.root.style.display = "none";
      return;
    }

    let placeIdx: number;
    let value: number;

    if (chartType === "stacked") {
      const top = u.cursor.top;
      if (top == null || top < 0) {
        t.root.style.display = "none";
        return;
      }
      const yVal = u.posToVal(top, "y");
      const hit = hitTestStackedBand(store, hiddenPlaces, idx, yVal);
      if (!hit) {
        t.root.style.display = "none";
        return;
      }
      placeIdx = hit.placeIdx;
      value = hit.value;
    } else {
      // Run chart: rely on uPlot's nearest-series focus (cursor.focus.prox).
      // series 0 is the x axis, so place index = focused - 1.
      if (focused.current < 1) {
        t.root.style.display = "none";
        return;
      }
      placeIdx = focused.current - 1;
      if (hiddenPlaces.has(store.places[placeIdx]?.placeId ?? "")) {
        t.root.style.display = "none";
        return;
      }
      value = store.columns[focused.current]?.[idx] ?? 0;
    }

    const place = store.places[placeIdx];
    if (!place) {
      t.root.style.display = "none";
      return;
    }

    const time = store.columns[0]![idx] ?? 0;

    t.dot.style.background = place.color;
    t.name.textContent = place.placeName;
    t.value.textContent = String(value);
    t.time.textContent = `${time.toFixed(3)}s`;
    t.frame.textContent = `Frame ${idx}`;

    // Position inside u.over (overflow:hidden — tooltip can't escape the
    // chart). Center horizontally on cursor and prefer above; clamp/flip so
    // the tooltip stays fully visible inside the plot area.
    t.root.style.display = "block"; // measure with current content
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
      // Not enough room above — flip below cursor.
      top = Math.min(cy + margin, oh - th);
    }

    t.root.style.left = `${left}px`;
    t.root.style.top = `${top}px`;
  };

  const series: uPlot.Series[] = [{ label: "Time" }];

  if (chartType === "stacked") {
    const visible = store.places.filter((p) => !hiddenPlaces.has(p.placeId));
    const reversed = [...visible].reverse();
    for (const p of reversed) {
      series.push({
        label: p.placeName,
        stroke: p.color,
        fill: `${p.color}88`,
        width: 2,
      });
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
    width,
    height,
    series,
    pxAlign: false,
    // Disable uPlot's auto right padding (reserved for the rightmost x-axis
    // label overhang). The label may overhang the right edge slightly — fine
    // for our full-bleed layout. Other sides keep auto padding (null).
    padding: [4, 0, 0, null],
    cursor: {
      lock: false,
      drag: { x: false, y: false, setScale: false },
      // For run mode: dim non-focused series and snap focus to nearest line
      // within `prox` pixels. Stacked mode ignores this (we hit-test bands).
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
    // Dim non-focused series in run mode (canvas alpha — no DOM cost)
    focus: { alpha: chartType === "stacked" ? 1 : 0.3 },
    axes: [
      {
        show: true,
        side: 0, // top — drawn as a Logic-Pro-style ruler (see drawClear hook)
        size: 26,
        font: "10px system-ui",
        stroke: "#475569", // slate-600 on the ruler tint
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
      x: {
        time: false,
        // Pin range exactly to data min/max — no auto padding on the right
        range: (_u, min, max) => [min, max],
      },
      y: {
        auto: true,
        range: (_u, min, max) => [Math.min(0, min), max * 1.05],
      },
    },
    hooks: {
      // Draw a thin separator line between the top axis area and the plot.
      drawClear: [
        (u) => {
          const ctx = u.ctx;
          const { left: bx, width: bw, top: by } = u.bbox; // physical pixels
          ctx.save();
          ctx.strokeStyle = "#cbd5e1"; // slate-300
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx, by - 0.5);
          ctx.lineTo(bx + bw, by - 0.5);
          ctx.stroke();
          ctx.restore();
        },
      ],
      setSeries: [
        (u, sIdx) => {
          focused.current = sIdx ?? -1;
          // Also refresh tooltip — setSeries may fire after setCursor for the
          // same mousemove, so the cursor-only update would have stale focus.
          updateTooltip(u);
        },
      ],
      setCursor: [
        (u) => {
          updateTooltip(u);
        },
      ],
      draw: [
        (u) => {
          const frameIdx = getPlayheadFrame();
          const times = u.data[0]!;
          if (times.length === 0) {
            return;
          }
          const time = times[Math.min(frameIdx, times.length - 1)]!;
          // All coords in physical (canvas) pixels — match valToPos(_, _, true)
          // and u.bbox. Multiply visual sizes by dpr so they look right on hidpi.
          const dpr = devicePixelRatio;
          const cx = u.valToPos(time, "x", true);
          const plotTop = u.bbox.top;
          const plotHeight = u.bbox.height;
          const ctx = u.ctx;

          // Logic Pro-style playhead: rounded-top "pin" — rectangular body
          // whose bottom corners taper diagonally to a single point at plotTop.
          const headW = 12 * dpr;
          const rectH = 6 * dpr;
          const tipH = 6 * dpr;
          const radius = 3 * dpr;
          const tipY = plotTop;
          const baseY = tipY - tipH; // where the taper begins
          const topY = baseY - rectH;
          const leftX = cx - headW / 2;
          const rightX = cx + headW / 2;

          ctx.save();
          ctx.fillStyle = "#1e293b"; // slate-800
          ctx.beginPath();
          ctx.moveTo(leftX, topY + radius);
          ctx.arcTo(leftX, topY, leftX + radius, topY, radius); // top-left
          ctx.lineTo(rightX - radius, topY);
          ctx.arcTo(rightX, topY, rightX, topY + radius, radius); // top-right
          ctx.lineTo(rightX, baseY); // right side down
          ctx.lineTo(cx, tipY); // diagonal to tip
          ctx.lineTo(leftX, baseY); // diagonal back to left side
          ctx.closePath(); // left side up
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1 * dpr;
          ctx.stroke();
          // Vertical line into the chart
          ctx.strokeStyle = "#1e293b";
          ctx.lineWidth = 1.5 * dpr;
          ctx.beginPath();
          ctx.moveTo(cx, tipY - 4);
          ctx.lineTo(cx, tipY + plotHeight);
          ctx.stroke();
          ctx.restore();
        },
      ],
    },
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
}> = ({
  store,
  chartType,
  hiddenPlaces,
  revision,
  totalFrames,
  currentFrameIndex,
}) => {
  "use no memo"; // imperative uPlot lifecycle
  const { setCurrentViewedFrame } = use(PlaybackContext);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const playheadFrameRef = useRef(currentFrameIndex);
  playheadFrameRef.current = currentFrameIndex;

  const onScrub = useCallback(
    (idx: number) => {
      setCurrentViewedFrame(Math.max(0, Math.min(idx, totalFrames - 1)));
    },
    [setCurrentViewedFrame, totalFrames],
  );

  // Build data from store
  const data =
    chartType === "stacked"
      ? buildStackedData(store, hiddenPlaces)
      : buildRunData(store, hiddenPlaces);

  // Create/recreate chart when structure changes
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || store.length === 0) {
      return;
    }

    const rect = wrapper.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const tooltip = createTooltip();

    const opts = buildUPlotOptions(
      store,
      chartType,
      hiddenPlaces,
      rect.width,
      rect.height,
      onScrub,
      () => playheadFrameRef.current,
      tooltip,
    );

    chartRef.current?.destroy();

    // eslint-disable-next-line new-cap -- uPlot's constructor is lowercase by convention
    const u = new uPlot(opts, data, wrapper);
    chartRef.current = u;

    // Mount tooltip inside u.over (the cursor overlay div). It positions
    // relative to that div and is bounded by its overflow:hidden — exactly
    // matching the chart area. Cleaned up automatically by u.destroy().
    u.over.appendChild(tooltip.root);

    // Ruler scrubbing: clicks/drags on the top axis area scrub the playhead.
    // u.over already handles scrubbing inside the plot via cursor.bind; here
    // we cover the area above u.over (the ruler) with native listeners on
    // u.root, which is the parent that contains both the ruler and u.over.
    let rulerDragging = false;
    const scrubFromClientX = (clientX: number) => {
      const overRect = u.over.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - overRect.left, overRect.width));
      onScrub(u.posToIdx(x));
    };
    const onRulerDown = (e: PointerEvent) => {
      const overRect = u.over.getBoundingClientRect();
      // Only handle clicks above the plot area (in the ruler band)
      if (e.clientY >= overRect.top) {
        return;
      }
      if (e.clientX < overRect.left || e.clientX > overRect.right) {
        return;
      }
      rulerDragging = true;
      u.root.setPointerCapture(e.pointerId);
      scrubFromClientX(e.clientX);
    };
    const onRulerMove = (e: PointerEvent) => {
      if (rulerDragging) {
        scrubFromClientX(e.clientX);
      }
    };
    const onRulerUp = (e: PointerEvent) => {
      if (rulerDragging) {
        rulerDragging = false;
        u.root.releasePointerCapture(e.pointerId);
      }
    };
    u.root.addEventListener("pointerdown", onRulerDown);
    u.root.addEventListener("pointermove", onRulerMove);
    u.root.addEventListener("pointerup", onRulerUp);
    u.root.addEventListener("pointercancel", onRulerUp);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          u.setSize({ width, height });
        }
      }
    });
    ro.observe(wrapper);

    return () => {
      ro.disconnect();
      u.destroy();
      chartRef.current = null;
    };
    // Recreate when chart type or visible series change
  }, [chartType, hiddenPlaces, store.places.length, onScrub]);

  // Stream update: just setData (no chart recreation)
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setData(data);
    }
  }, [revision]);

  // Redraw when playhead moves (triggers the draw hook)
  useEffect(() => {
    chartRef.current?.redraw(false, false);
  }, [currentFrameIndex]);

  return <div ref={wrapperRef} style={{ width: "100%", height: "100%" }} />;
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

  const togglePlaceVisibility = useCallback((placeId: string) => {
    setHiddenPlaces((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) {
        next.delete(placeId);
      } else {
        next.add(placeId);
      }
      return next;
    });
  }, []);

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
      <div className={chartAreaStyle}>
        <div className={chartWrapperStyle}>
          <UPlotChart
            store={store}
            chartType={chartType}
            hiddenPlaces={hiddenPlaces}
            revision={revision}
            totalFrames={totalFrames}
            currentFrameIndex={currentFrameIndex}
          />
        </div>
      </div>
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
