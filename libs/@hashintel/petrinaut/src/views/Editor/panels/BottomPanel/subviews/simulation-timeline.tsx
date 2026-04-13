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
  gap: "[8px]",
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
  paddingTop: "[4px]",
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

// -- uPlot options builder ----------------------------------------------------

function buildUPlotOptions(
  store: StreamingStore,
  chartType: TimelineChartType,
  hiddenPlaces: Set<string>,
  width: number,
  height: number,
  onScrub: (frameIndex: number) => void,
  getPlayheadFrame: () => number,
): uPlot.Options {
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
    cursor: {
      lock: true,
      drag: { x: false, y: false, setScale: false },
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
    axes: [
      {
        show: true,
        size: 24,
        font: "10px system-ui",
        stroke: "#999",
        grid: { stroke: "#f3f4f6", width: 1 },
        ticks: { stroke: "#e5e7eb", width: 1 },
        values: (_u, vals) => vals.map((v) => `${v}s`),
      },
      {
        show: true,
        size: 50,
        font: "10px system-ui",
        stroke: "#999",
        grid: { stroke: "#f3f4f6", width: 1, dash: [4, 4] },
        ticks: { stroke: "#e5e7eb", width: 1 },
      },
    ],
    scales: {
      x: { time: false, auto: true },
      y: {
        auto: true,
        range: (_u, min, max) => [Math.min(0, min), max * 1.05],
      },
    },
    hooks: {
      draw: [
        (u) => {
          const frameIdx = getPlayheadFrame();
          const times = u.data[0]!;
          if (times.length === 0) {
            return;
          }
          const time = times[Math.min(frameIdx, times.length - 1)]!;
          const cx = u.valToPos(time, "x", true);
          const plotTop = u.bbox.top / devicePixelRatio;
          const plotHeight = u.bbox.height / devicePixelRatio;
          const ctx = u.ctx;

          ctx.save();
          // Arrow head
          ctx.fillStyle = "#333";
          ctx.beginPath();
          ctx.moveTo(cx - 5, plotTop);
          ctx.lineTo(cx + 5, plotTop);
          ctx.lineTo(cx, plotTop + 7);
          ctx.closePath();
          ctx.fill();
          // Vertical line
          ctx.strokeStyle = "#333";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx, plotTop + 6);
          ctx.lineTo(cx, plotTop + plotHeight);
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

    const opts = buildUPlotOptions(
      store,
      chartType,
      hiddenPlaces,
      rect.width,
      rect.height,
      onScrub,
      () => playheadFrameRef.current,
    );

    chartRef.current?.destroy();

    // eslint-disable-next-line new-cap -- uPlot's constructor is lowercase by convention
    const u = new uPlot(opts, data, wrapper);
    chartRef.current = u;

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
};
