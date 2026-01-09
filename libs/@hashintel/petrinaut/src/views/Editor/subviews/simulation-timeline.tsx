import { css } from "@hashintel/ds-helpers/css";
import { useCallback, useMemo, useRef, useState } from "react";

import { SegmentGroup } from "../../../components/segment-group";
import type { SubView } from "../../../components/sub-view/types";
import { useEditorStore } from "../../../state/editor-provider";
import type { TimelineChartType } from "../../../state/editor-store";
import { useSDCPNContext } from "../../../state/sdcpn-provider";
import { useSimulationStore } from "../../../state/simulation-provider";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  gap: "[8px]",
});

const chartContainerStyle = css({
  flex: "[1]",
  minHeight: "[60px]",
  position: "relative",
  cursor: "pointer",
});

const playheadStyle = css({
  position: "absolute",
  top: "[0]",
  bottom: "[0]",
  width: "[1px]",
  pointerEvents: "none",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
});

const playheadLineStyle = css({
  flex: "[1]",
  width: "[1.5px]",
  background: "[#333]",
});

const playheadArrowStyle = css({
  width: "[0]",
  height: "[0]",
  borderLeft: "[5px solid transparent]",
  borderRight: "[5px solid transparent]",
  borderTop: "[7px solid #333]",
  marginBottom: "[-1px]",
});

const svgStyle = css({
  width: "[100%]",
  height: "[100%]",
  display: "block",
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

// Default color palette for places without a specific color
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

/**
 * Header action component that renders a chart type selector.
 */
const TimelineChartTypeSelector: React.FC = () => {
  const chartType = useEditorStore((state) => state.timelineChartType);
  const setChartType = useEditorStore((state) => state.setTimelineChartType);

  return (
    <SegmentGroup
      value={chartType}
      options={CHART_TYPE_OPTIONS}
      onChange={(value) => setChartType(value as TimelineChartType)}
      size="sm"
    />
  );
};

interface CompartmentData {
  placeId: string;
  placeName: string;
  color: string;
  values: number[]; // token count at each frame
}

/**
 * Shared legend state interface for chart components.
 */
interface LegendState {
  hiddenPlaces: Set<string>;
  hoveredPlaceId: string | null;
}

/**
 * Hook to extract compartment data from simulation frames.
 */
const useCompartmentData = (): CompartmentData[] => {
  const simulation = useSimulationStore((state) => state.simulation);
  const {
    petriNetDefinition: { places, types },
  } = useSDCPNContext();

  return useMemo((): CompartmentData[] => {
    if (!simulation || simulation.frames.length === 0) {
      return [];
    }

    // Create a map of place ID to color
    const placeColors = new Map<string, string>();
    for (const [index, place] of places.entries()) {
      // Try to get color from the place's token type
      const tokenType = types.find((type) => type.id === place.colorId);
      const color =
        tokenType?.displayColor ??
        DEFAULT_COLORS[index % DEFAULT_COLORS.length]!;
      placeColors.set(place.id, color);
    }

    // Extract token counts for each place across all frames
    return places.map((place) => {
      const values = simulation.frames.map((frame) => {
        const placeData = frame.places.get(place.id);
        return placeData?.count ?? 0;
      });

      return {
        placeId: place.id,
        placeName: place.name,
        color: placeColors.get(place.id) ?? DEFAULT_COLORS[0]!,
        values,
      };
    });
  }, [simulation, places, types]);
};

/**
 * Shared playhead indicator component for timeline charts.
 */
const PlayheadIndicator: React.FC<{ totalFrames: number }> = ({
  totalFrames,
}) => {
  const currentlyViewedFrame = useSimulationStore(
    (state) => state.currentlyViewedFrame,
  );

  return (
    <div
      className={playheadStyle}
      style={{
        left: `${(currentlyViewedFrame / Math.max(1, totalFrames - 1)) * 100}%`,
      }}
    >
      <div className={playheadArrowStyle} />
      <div className={playheadLineStyle} />
    </div>
  );
};

/**
 * Shared legend component for timeline charts.
 */
const TimelineLegend: React.FC<{
  compartmentData: CompartmentData[];
  hiddenPlaces: Set<string>;
  hoveredPlaceId: string | null;
  onToggleVisibility: (placeId: string) => void;
  onHover: (placeId: string | null) => void;
}> = ({
  compartmentData,
  hiddenPlaces,
  hoveredPlaceId,
  onToggleVisibility,
  onHover,
}) => (
  <div className={legendContainerStyle}>
    {compartmentData.map((data) => {
      const isHidden = hiddenPlaces.has(data.placeId);
      const isHovered = hoveredPlaceId === data.placeId;
      const isDimmed = hoveredPlaceId && !isHovered;

      return (
        <div
          key={data.placeId}
          role="button"
          tabIndex={0}
          className={legendItemStyle}
          onClick={() => onToggleVisibility(data.placeId)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggleVisibility(data.placeId);
            }
          }}
          onMouseEnter={() => onHover(data.placeId)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(data.placeId)}
          onBlur={() => onHover(null)}
          style={{
            opacity: isHidden ? 0.4 : isDimmed ? 0.6 : 1,
            textDecoration: isHidden ? "line-through" : "none",
          }}
        >
          <div
            className={legendColorStyle}
            style={{
              backgroundColor: data.color,
              opacity: isHidden ? 0.5 : 1,
            }}
          />
          <span>{data.placeName}</span>
        </div>
      );
    })}
  </div>
);

interface ChartProps {
  compartmentData: CompartmentData[];
  legendState: LegendState;
}

/**
 * CompartmentTimeSeries displays a line chart showing token counts over time.
 * Clicking/dragging on the chart scrubs through frames.
 */
const CompartmentTimeSeries: React.FC<ChartProps> = ({
  compartmentData,
  legendState,
}) => {
  const simulation = useSimulationStore((state) => state.simulation);
  const setCurrentlyViewedFrame = useSimulationStore(
    (state) => state.setCurrentlyViewedFrame,
  );

  const chartRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  const { hiddenPlaces, hoveredPlaceId } = legendState;

  // Calculate chart dimensions and scales
  const chartMetrics = useMemo(() => {
    if (compartmentData.length === 0 || !simulation) {
      return null;
    }

    const totalFrames = simulation.frames.length;
    const maxValue = Math.max(
      1,
      ...compartmentData.flatMap((data) => data.values),
    );

    // Add some padding to max value for visual breathing room
    const yMax = Math.ceil(maxValue * 1.1);

    return {
      totalFrames,
      maxValue,
      yMax,
      xScale: (frameIndex: number, width: number) =>
        (frameIndex / Math.max(1, totalFrames - 1)) * width,
      yScale: (value: number, height: number) =>
        height - (value / yMax) * height,
    };
  }, [compartmentData, simulation]);

  // Handle mouse interaction for scrubbing
  const handleScrub = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!chartRef.current || !chartMetrics) {
        return;
      }

      const rect = chartRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const width = rect.width;

      // Calculate frame index from x position
      const progress = Math.max(0, Math.min(1, x / width));
      const frameIndex = Math.round(progress * (chartMetrics.totalFrames - 1));

      setCurrentlyViewedFrame(frameIndex);
    },
    [chartMetrics, setCurrentlyViewedFrame],
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      isDraggingRef.current = true;
      handleScrub(event);
    },
    [handleScrub],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (isDraggingRef.current) {
        handleScrub(event);
      }
    },
    [handleScrub],
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Generate SVG path for a data series
  const generatePath = useCallback(
    (values: number[], width: number, height: number) => {
      if (!chartMetrics || values.length === 0) {
        return "";
      }

      const points = values.map((value, index) => {
        const x = chartMetrics.xScale(index, width);
        const y = chartMetrics.yScale(value, height);
        return `${x},${y}`;
      });

      return `M ${points.join(" L ")}`;
    },
    [chartMetrics],
  );

  if (!simulation || compartmentData.length === 0 || !chartMetrics) {
    return null;
  }

  return (
    <svg
      ref={chartRef}
      className={svgStyle}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {/* Background grid lines */}
      <line
        x1="0"
        y1="100"
        x2="100"
        y2="100"
        stroke="#e5e7eb"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="0"
        y1="50"
        x2="100"
        y2="50"
        stroke="#f3f4f6"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
        strokeDasharray="2,2"
      />
      <line
        x1="0"
        y1="0"
        x2="100"
        y2="0"
        stroke="#f3f4f6"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
      />

      {/* Data lines - render non-hovered first, then hovered on top */}
      {compartmentData
        .filter((data) => !hiddenPlaces.has(data.placeId))
        .filter((data) => data.placeId !== hoveredPlaceId)
        .map((data) => (
          <path
            key={data.placeId}
            d={generatePath(data.values, 100, 100)}
            fill="none"
            stroke={data.color}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={hoveredPlaceId ? 0.2 : 1}
            style={{ transition: "opacity 0.15s ease" }}
          />
        ))}
      {/* Render hovered line on top */}
      {hoveredPlaceId &&
        !hiddenPlaces.has(hoveredPlaceId) &&
        compartmentData
          .filter((data) => data.placeId === hoveredPlaceId)
          .map((data) => (
            <path
              key={data.placeId}
              d={generatePath(data.values, 100, 100)}
              fill="none"
              stroke={data.color}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
    </svg>
  );
};

/**
 * StackedAreaChart displays a stacked area chart showing token counts over time.
 * Each place's tokens are stacked on top of each other to show the total distribution.
 * Clicking/dragging on the chart scrubs through frames.
 */
const StackedAreaChart: React.FC<ChartProps> = ({
  compartmentData,
  legendState,
}) => {
  const simulation = useSimulationStore((state) => state.simulation);
  const setCurrentlyViewedFrame = useSimulationStore(
    (state) => state.setCurrentlyViewedFrame,
  );

  const chartRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  const { hiddenPlaces, hoveredPlaceId } = legendState;

  // Filter visible compartment data
  const visibleCompartmentData = useMemo(() => {
    return compartmentData.filter((data) => !hiddenPlaces.has(data.placeId));
  }, [compartmentData, hiddenPlaces]);

  // Calculate stacked values and chart metrics
  const { stackedData, chartMetrics } = useMemo(() => {
    if (visibleCompartmentData.length === 0 || !simulation) {
      return { stackedData: [], chartMetrics: null };
    }

    const totalFrames = simulation.frames.length;

    // Calculate stacked values: for each frame, accumulate the values
    // stackedData[i] contains { placeId, color, baseValues[], topValues[] }
    const stacked: Array<{
      placeId: string;
      placeName: string;
      color: string;
      baseValues: number[];
      topValues: number[];
    }> = [];

    // Track cumulative values at each frame
    const cumulativeAtFrame: number[] = new Array<number>(totalFrames).fill(0);

    for (const data of visibleCompartmentData) {
      const baseValues: number[] = [...cumulativeAtFrame];
      const topValues: number[] = data.values.map((value, frameIdx) => {
        const newCumulative = (cumulativeAtFrame[frameIdx] ?? 0) + value;
        cumulativeAtFrame[frameIdx] = newCumulative;
        return newCumulative;
      });

      stacked.push({
        placeId: data.placeId,
        placeName: data.placeName,
        color: data.color,
        baseValues,
        topValues,
      });
    }

    // Find the max stacked value for scaling
    const maxValue = Math.max(1, ...cumulativeAtFrame);
    const yMax = Math.ceil(maxValue * 1.1);

    return {
      stackedData: stacked,
      chartMetrics: {
        totalFrames,
        maxValue,
        yMax,
        xScale: (frameIndex: number, width: number) =>
          (frameIndex / Math.max(1, totalFrames - 1)) * width,
        yScale: (value: number, height: number) =>
          height - (value / yMax) * height,
      },
    };
  }, [visibleCompartmentData, simulation]);

  // Handle mouse interaction for scrubbing
  const handleScrub = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!chartRef.current || !chartMetrics) {
        return;
      }

      const rect = chartRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const width = rect.width;

      // Calculate frame index from x position
      const progress = Math.max(0, Math.min(1, x / width));
      const frameIndex = Math.round(progress * (chartMetrics.totalFrames - 1));

      setCurrentlyViewedFrame(frameIndex);
    },
    [chartMetrics, setCurrentlyViewedFrame],
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      isDraggingRef.current = true;
      handleScrub(event);
    },
    [handleScrub],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (isDraggingRef.current) {
        handleScrub(event);
      }
    },
    [handleScrub],
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Generate SVG path for a stacked area
  const generateAreaPath = useCallback(
    (
      baseValues: number[],
      topValues: number[],
      width: number,
      height: number,
    ) => {
      if (!chartMetrics || topValues.length === 0) {
        return "";
      }

      // Build the path: top line forward, then bottom line backward
      const topPoints = topValues.map((value, index) => {
        const x = chartMetrics.xScale(index, width);
        const y = chartMetrics.yScale(value, height);
        return `${x},${y}`;
      });

      const basePoints = baseValues
        .map((value, index) => {
          const x = chartMetrics.xScale(index, width);
          const y = chartMetrics.yScale(value, height);
          return `${x},${y}`;
        })
        .reverse();

      return `M ${topPoints.join(" L ")} L ${basePoints.join(" L ")} Z`;
    },
    [chartMetrics],
  );

  if (!simulation || compartmentData.length === 0 || !chartMetrics) {
    return null;
  }

  return (
    <svg
      ref={chartRef}
      className={svgStyle}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {/* Background grid lines */}
      <line
        x1="0"
        y1="100"
        x2="100"
        y2="100"
        stroke="#e5e7eb"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="0"
        y1="50"
        x2="100"
        y2="50"
        stroke="#f3f4f6"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
        strokeDasharray="2,2"
      />
      <line
        x1="0"
        y1="0"
        x2="100"
        y2="0"
        stroke="#f3f4f6"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
      />

      {/* Stacked areas - render from bottom to top */}
      {stackedData.map((data) => {
        const isHovered = hoveredPlaceId === data.placeId;
        const isDimmed = hoveredPlaceId && !isHovered;

        return (
          <path
            key={data.placeId}
            d={generateAreaPath(data.baseValues, data.topValues, 100, 100)}
            fill={data.color}
            stroke={data.color}
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
            opacity={isDimmed ? 0.3 : isHovered ? 1 : 0.7}
            style={{ transition: "opacity 0.15s ease" }}
          />
        );
      })}
    </svg>
  );
};

/**
 * SimulationTimelineContent displays timeline information for the running simulation.
 * Shows a compartment time-series chart with interactive scrubbing.
 */
const SimulationTimelineContent: React.FC = () => {
  const chartType = useEditorStore((state) => state.timelineChartType);
  const simulation = useSimulationStore((state) => state.simulation);
  const compartmentData = useCompartmentData();

  // Shared legend state - persists across chart type switches
  const [hiddenPlaces, setHiddenPlaces] = useState<Set<string>>(new Set());
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);

  const legendState: LegendState = useMemo(
    () => ({ hiddenPlaces, hoveredPlaceId }),
    [hiddenPlaces, hoveredPlaceId],
  );

  // Toggle visibility handler
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

  const handleHover = useCallback((placeId: string | null) => {
    setHoveredPlaceId(placeId);
  }, []);

  const totalFrames = simulation?.frames.length ?? 0;

  if (compartmentData.length === 0 || totalFrames === 0) {
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
      <div className={chartContainerStyle}>
        {chartType === "stacked" ? (
          <StackedAreaChart
            compartmentData={compartmentData}
            legendState={legendState}
          />
        ) : (
          <CompartmentTimeSeries
            compartmentData={compartmentData}
            legendState={legendState}
          />
        )}
        <PlayheadIndicator totalFrames={totalFrames} />
      </div>
      <TimelineLegend
        compartmentData={compartmentData}
        hiddenPlaces={hiddenPlaces}
        hoveredPlaceId={hoveredPlaceId}
        onToggleVisibility={togglePlaceVisibility}
        onHover={handleHover}
      />
    </div>
  );
};

/**
 * SubView definition for Simulation Timeline tab.
 * This tab is only visible when simulation is running or paused.
 */
export const simulationTimelineSubView: SubView = {
  id: "simulation-timeline",
  title: "Timeline",
  tooltip:
    "View the simulation timeline with compartment time-series. Click/drag to scrub through frames.",
  component: SimulationTimelineContent,
  renderHeaderAction: () => <TimelineChartTypeSelector />,
};
