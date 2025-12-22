import { css } from "@hashintel/ds-helpers/css";
import { useCallback, useMemo, useRef } from "react";

import type { SubView } from "../../../components/sub-view/types";
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
});

const legendColorStyle = css({
  width: "[10px]",
  height: "[10px]",
  borderRadius: "[2px]",
});

const statsRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[16px]",
  fontSize: "[12px]",
  color: "[#666]",
});

const statItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
});

const statLabelStyle = css({
  fontWeight: 500,
  color: "[#999]",
});

const statValueStyle = css({
  fontWeight: 600,
  color: "[#333]",
  fontVariantNumeric: "tabular-nums",
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

interface CompartmentData {
  placeId: string;
  placeName: string;
  color: string;
  values: number[]; // token count at each frame
}

/**
 * CompartmentTimeSeries displays a line chart showing token counts over time.
 * Clicking/dragging on the chart scrubs through frames.
 */
const CompartmentTimeSeries: React.FC = () => {
  const simulation = useSimulationStore((state) => state.simulation);
  const currentlyViewedFrame = useSimulationStore(
    (state) => state.currentlyViewedFrame
  );
  const setCurrentlyViewedFrame = useSimulationStore(
    (state) => state.setCurrentlyViewedFrame
  );
  const dt = useSimulationStore((state) => state.dt);

  const {
    petriNetDefinition: { places, types },
  } = useSDCPNContext();

  const chartRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  // Extract compartment data from simulation frames
  const compartmentData = useMemo((): CompartmentData[] => {
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

  // Calculate chart dimensions and scales
  const chartMetrics = useMemo(() => {
    if (compartmentData.length === 0 || !simulation) {
      return null;
    }

    const totalFrames = simulation.frames.length;
    const maxValue = Math.max(
      1,
      ...compartmentData.flatMap((data) => data.values)
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
    [chartMetrics, setCurrentlyViewedFrame]
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      isDraggingRef.current = true;
      handleScrub(event);
    },
    [handleScrub]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (isDraggingRef.current) {
        handleScrub(event);
      }
    },
    [handleScrub]
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
    [chartMetrics]
  );

  if (!simulation || compartmentData.length === 0 || !chartMetrics) {
    return (
      <div className={containerStyle}>
        <div className={statsRowStyle}>
          <span className={statLabelStyle}>No simulation data available</span>
        </div>
      </div>
    );
  }

  const totalFrames = chartMetrics.totalFrames;
  const currentTime = currentlyViewedFrame * dt;
  const totalTime = (totalFrames - 1) * dt;

  return (
    <div className={containerStyle}>
      {/* Stats row */}
      <div className={statsRowStyle}>
        <div className={statItemStyle}>
          <span className={statLabelStyle}>Frame:</span>
          <span className={statValueStyle}>
            {currentlyViewedFrame} / {totalFrames - 1}
          </span>
        </div>
        <div className={statItemStyle}>
          <span className={statLabelStyle}>Time:</span>
          <span className={statValueStyle}>
            {currentTime.toFixed(3)}s / {totalTime.toFixed(3)}s
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className={chartContainerStyle}>
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

          {/* Data lines */}
          {compartmentData.map((data) => (
            <path
              key={data.placeId}
              d={generatePath(data.values, 100, 100)}
              fill="none"
              stroke={data.color}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Playhead indicator */}
          <line
            x1={chartMetrics.xScale(currentlyViewedFrame, 100)}
            y1="0"
            x2={chartMetrics.xScale(currentlyViewedFrame, 100)}
            y2="100"
            stroke="#333"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={chartMetrics.xScale(currentlyViewedFrame, 100)}
            cy="0"
            r="3"
            fill="#333"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Legend */}
      <div className={legendContainerStyle}>
        {compartmentData.map((data) => (
          <div key={data.placeId} className={legendItemStyle}>
            <div
              className={legendColorStyle}
              style={{ backgroundColor: data.color }}
            />
            <span>{data.placeName}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * SimulationTimelineContent displays timeline information for the running simulation.
 * Shows a compartment time-series chart with interactive scrubbing.
 */
const SimulationTimelineContent: React.FC = () => {
  return <CompartmentTimeSeries />;
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
};
