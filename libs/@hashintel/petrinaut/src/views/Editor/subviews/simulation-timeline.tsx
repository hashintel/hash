import { css } from "@hashintel/ds-helpers/css";
import { scaleLinear } from "d3-scale";
import { use, useCallback, useMemo, useRef, useState } from "react";

import { SegmentGroup } from "../../../components/segment-group";
import type { SubView } from "../../../components/sub-view/types";
import type { TimelineChartType } from "../../../state/editor-provider";
import { useEditorStore } from "../../../state/editor-provider";
import { useSDCPNContext } from "../../../state/sdcpn-provider";
import { SimulationContext } from "../../../state/simulation-provider";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  gap: "[8px]",
});

const chartRowStyle = css({
  display: "flex",
  flex: "[1]",
  minHeight: "[60px]",
  gap: "[4px]",
});

const yAxisStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  fontSize: "[10px]",
  color: "[#666]",
  paddingRight: "[4px]",
  minWidth: "[32px]",
  userSelect: "none",
});

const yAxisTickStyle = css({
  position: "absolute",
  right: "[4px]",
  lineHeight: "[1]",
  transform: "translateY(-50%)",
});

const chartContainerStyle = css({
  flex: "[1]",
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

const tooltipStyle = css({
  position: "fixed",
  pointerEvents: "none",
  backgroundColor: "[rgba(0, 0, 0, 0.85)]",
  color: "[white]",
  padding: "[6px 10px]",
  borderRadius: "[6px]",
  fontSize: "[11px]",
  lineHeight: "[1.4]",
  zIndex: "[1000]",
  whiteSpace: "nowrap",
  boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.25)]",
  transform: "translate(-50%, -100%)",
  marginTop: "[-8px]",
});

const tooltipLabelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const tooltipColorDotStyle = css({
  width: "[8px]",
  height: "[8px]",
  borderRadius: "[50%]",
  flexShrink: "[0]",
});

const tooltipValueStyle = css({
  fontWeight: "[600]",
  marginLeft: "[4px]",
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
 * Tooltip state for displaying token counts on hover.
 */
interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  placeName: string;
  color: string;
  value: number;
  frameIndex: number;
  time: number;
}

/**
 * Hook to extract compartment data from simulation frames.
 */
const useCompartmentData = (): CompartmentData[] => {
  const { simulation } = use(SimulationContext);
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
 * Represents the Y-axis scale configuration.
 */
interface YAxisScale {
  /** The maximum value for the Y-axis (after applying .nice()) */
  yMax: number;
  /** Tick values to display on the Y-axis */
  ticks: number[];
  /** Convert a data value to a percentage (0-100) for SVG positioning */
  toPercent: (value: number) => number;
}

/**
 * Computes a nice Y-axis scale using D3's scale utilities.
 * Returns tick values that are round numbers appropriate for the data range.
 */
const useYAxisScale = (
  compartmentData: CompartmentData[],
  chartType: TimelineChartType,
  hiddenPlaces: Set<string>,
): YAxisScale => {
  return useMemo(() => {
    if (compartmentData.length === 0) {
      return {
        yMax: 10,
        ticks: [0, 5, 10],
        toPercent: (value: number) => 100 - (value / 10) * 100,
      };
    }

    // Filter to visible data
    const visibleData = compartmentData.filter(
      (item) => !hiddenPlaces.has(item.placeId),
    );

    let maxValue: number;

    if (chartType === "stacked") {
      // For stacked chart, calculate the maximum cumulative value
      if (visibleData.length === 0) {
        maxValue = 1;
      } else {
        const frameCount = visibleData[0]?.values.length ?? 0;
        let maxCumulative = 0;
        for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
          let cumulative = 0;
          for (const data of visibleData) {
            cumulative += data.values[frameIdx] ?? 0;
          }
          maxCumulative = Math.max(maxCumulative, cumulative);
        }
        maxValue = Math.max(1, maxCumulative);
      }
    } else {
      // For run chart, find the maximum individual value
      maxValue = Math.max(1, ...visibleData.flatMap((item) => item.values));
    }

    // Use D3 to create a nice scale
    const scale = scaleLinear().domain([0, maxValue]).nice();
    const niceDomain = scale.domain();
    const yMax = niceDomain[1] ?? maxValue;

    // Get tick values (aim for 3-5 ticks based on the range)
    const ticks = scale.ticks(4);

    return {
      yMax,
      ticks,
      toPercent: (value: number) => 100 - (value / yMax) * 100,
    };
  }, [compartmentData, chartType, hiddenPlaces]);
};

/**
 * Y-axis component that displays tick labels.
 */
const YAxis: React.FC<{ scale: YAxisScale }> = ({ scale }) => {
  return (
    <div className={yAxisStyle}>
      {scale.ticks.map((tick) => (
        <span
          key={tick}
          className={yAxisTickStyle}
          style={{
            top: `${scale.toPercent(tick)}%`,
          }}
        >
          {tick}
        </span>
      ))}
    </div>
  );
};

/**
 * Tooltip component for displaying token count on hover.
 */
const ChartTooltip: React.FC<{ tooltip: TooltipState | null }> = ({
  tooltip,
}) => {
  if (!tooltip?.visible) {
    return null;
  }

  return (
    <div
      className={tooltipStyle}
      style={{
        left: tooltip.x,
        top: tooltip.y,
      }}
    >
      <div className={tooltipLabelStyle}>
        <div
          className={tooltipColorDotStyle}
          style={{ backgroundColor: tooltip.color }}
        />
        <span>{tooltip.placeName}</span>
        <span className={tooltipValueStyle}>{tooltip.value}</span>
      </div>
      <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>
        {tooltip.time.toFixed(3)}s
      </div>
      <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>
        Frame {tooltip.frameIndex}
      </div>
    </div>
  );
};

/**
 * Shared playhead indicator component for timeline charts.
 */
const PlayheadIndicator: React.FC<{ totalFrames: number }> = ({
  totalFrames,
}) => {
  const { currentlyViewedFrame } = use(SimulationContext);

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
  yAxisScale: YAxisScale;
  onTooltipChange: (tooltip: TooltipState | null) => void;
  onPlaceHover: (placeId: string | null) => void;
}

/**
 * CompartmentTimeSeries displays a line chart showing token counts over time.
 * Clicking/dragging on the chart scrubs through frames.
 */
const CompartmentTimeSeries: React.FC<ChartProps> = ({
  compartmentData,
  legendState,
  yAxisScale,
  onTooltipChange,
  onPlaceHover,
}) => {
  const { simulation, setCurrentlyViewedFrame } = use(SimulationContext);

  const chartRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  // Track locally hovered place (from SVG path hover)
  const [localHoveredPlaceId, setLocalHoveredPlaceId] = useState<string | null>(
    null,
  );

  const { hiddenPlaces, hoveredPlaceId } = legendState;

  // Use local hover if available, otherwise fall back to legend hover
  const activeHoveredPlaceId = localHoveredPlaceId ?? hoveredPlaceId;

  // Calculate chart dimensions and scales
  const chartMetrics = useMemo(() => {
    if (compartmentData.length === 0 || !simulation) {
      return null;
    }

    const totalFrames = simulation.frames.length;

    return {
      totalFrames,
      xScale: (frameIndex: number, width: number) =>
        (frameIndex / Math.max(1, totalFrames - 1)) * width,
      yScale: (value: number, height: number) =>
        height - (value / yAxisScale.yMax) * height,
    };
  }, [compartmentData, simulation, yAxisScale.yMax]);

  // Calculate frame index from mouse position
  const getFrameFromEvent = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!chartRef.current || !chartMetrics) {
        return null;
      }

      const rect = chartRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const width = rect.width;

      const progress = Math.max(0, Math.min(1, x / width));
      return Math.round(progress * (chartMetrics.totalFrames - 1));
    },
    [chartMetrics],
  );

  // Handle mouse interaction for scrubbing
  const handleScrub = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const frameIndex = getFrameFromEvent(event);
      if (frameIndex !== null) {
        setCurrentlyViewedFrame(frameIndex);
      }
    },
    [getFrameFromEvent, setCurrentlyViewedFrame],
  );

  // Update tooltip based on mouse position and hovered place
  const updateTooltip = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!localHoveredPlaceId || !simulation) {
        onTooltipChange(null);
        return;
      }

      const frameIndex = getFrameFromEvent(event);
      if (frameIndex === null) {
        onTooltipChange(null);
        return;
      }

      const placeData = compartmentData.find(
        (data) => data.placeId === localHoveredPlaceId,
      );
      if (!placeData || hiddenPlaces.has(localHoveredPlaceId)) {
        onTooltipChange(null);
        return;
      }

      const value = placeData.values[frameIndex] ?? 0;
      const time = simulation.frames[frameIndex]?.time ?? 0;

      onTooltipChange({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        placeName: placeData.placeName,
        color: placeData.color,
        value,
        frameIndex,
        time,
      });
    },
    [
      compartmentData,
      hiddenPlaces,
      localHoveredPlaceId,
      simulation,
      getFrameFromEvent,
      onTooltipChange,
    ],
  );

  // Handle path hover
  const handlePathMouseEnter = useCallback(
    (placeId: string) => {
      setLocalHoveredPlaceId(placeId);
      onPlaceHover(placeId);
    },
    [onPlaceHover],
  );

  const handlePathMouseLeave = useCallback(() => {
    setLocalHoveredPlaceId(null);
    onPlaceHover(null);
  }, [onPlaceHover]);

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
      updateTooltip(event);
    },
    [handleScrub, updateTooltip],
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    onTooltipChange(null);
  }, [onTooltipChange]);

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
        .filter((data) => data.placeId !== activeHoveredPlaceId)
        .map((data) => (
          <g key={data.placeId}>
            {/* Visible line */}
            <path
              d={generatePath(data.values, 100, 100)}
              fill="none"
              stroke={data.color}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={activeHoveredPlaceId ? 0.2 : 1}
              style={{
                transition: "opacity 0.15s ease",
                pointerEvents: "none",
              }}
            />
            {/* Invisible hit area for easier hovering */}
            <path
              d={generatePath(data.values, 100, 100)}
              fill="none"
              stroke="transparent"
              strokeWidth="8"
              vectorEffect="non-scaling-stroke"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => handlePathMouseEnter(data.placeId)}
              onMouseLeave={handlePathMouseLeave}
            />
          </g>
        ))}
      {/* Render hovered line on top */}
      {activeHoveredPlaceId &&
        !hiddenPlaces.has(activeHoveredPlaceId) &&
        compartmentData
          .filter((data) => data.placeId === activeHoveredPlaceId)
          .map((data) => (
            <g key={data.placeId}>
              {/* Visible line */}
              <path
                d={generatePath(data.values, 100, 100)}
                fill="none"
                stroke={data.color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ pointerEvents: "none" }}
              />
              {/* Invisible hit area */}
              <path
                d={generatePath(data.values, 100, 100)}
                fill="none"
                stroke="transparent"
                strokeWidth="8"
                vectorEffect="non-scaling-stroke"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => handlePathMouseEnter(data.placeId)}
                onMouseLeave={handlePathMouseLeave}
              />
            </g>
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
  yAxisScale,
  onTooltipChange,
  onPlaceHover,
}) => {
  const { simulation, setCurrentlyViewedFrame } = use(SimulationContext);

  const chartRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  // Track locally hovered place (from SVG path hover)
  const [localHoveredPlaceId, setLocalHoveredPlaceId] = useState<string | null>(
    null,
  );

  const { hiddenPlaces, hoveredPlaceId } = legendState;

  // Use local hover if available, otherwise fall back to legend hover
  const activeHoveredPlaceId = localHoveredPlaceId ?? hoveredPlaceId;

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

    return {
      stackedData: stacked,
      chartMetrics: {
        totalFrames,
        xScale: (frameIndex: number, width: number) =>
          (frameIndex / Math.max(1, totalFrames - 1)) * width,
        yScale: (value: number, height: number) =>
          height - (value / yAxisScale.yMax) * height,
      },
    };
  }, [visibleCompartmentData, simulation, yAxisScale.yMax]);

  // Calculate frame index from mouse position
  const getFrameFromEvent = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!chartRef.current || !chartMetrics) {
        return null;
      }

      const rect = chartRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const width = rect.width;

      const progress = Math.max(0, Math.min(1, x / width));
      return Math.round(progress * (chartMetrics.totalFrames - 1));
    },
    [chartMetrics],
  );

  // Handle mouse interaction for scrubbing
  const handleScrub = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const frameIndex = getFrameFromEvent(event);
      if (frameIndex !== null) {
        setCurrentlyViewedFrame(frameIndex);
      }
    },
    [getFrameFromEvent, setCurrentlyViewedFrame],
  );

  // Update tooltip based on mouse position and hovered place
  const updateTooltip = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!localHoveredPlaceId || !simulation) {
        onTooltipChange(null);
        return;
      }

      const frameIndex = getFrameFromEvent(event);
      if (frameIndex === null) {
        onTooltipChange(null);
        return;
      }

      // For stacked chart, get the original (non-stacked) value
      const placeData = compartmentData.find(
        (data) => data.placeId === localHoveredPlaceId,
      );
      if (!placeData || hiddenPlaces.has(localHoveredPlaceId)) {
        onTooltipChange(null);
        return;
      }

      const value = placeData.values[frameIndex] ?? 0;
      const time = simulation.frames[frameIndex]?.time ?? 0;

      onTooltipChange({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        placeName: placeData.placeName,
        color: placeData.color,
        value,
        frameIndex,
        time,
      });
    },
    [
      compartmentData,
      hiddenPlaces,
      localHoveredPlaceId,
      simulation,
      getFrameFromEvent,
      onTooltipChange,
    ],
  );

  // Handle path hover
  const handlePathMouseEnter = useCallback(
    (placeId: string) => {
      setLocalHoveredPlaceId(placeId);
      onPlaceHover(placeId);
    },
    [onPlaceHover],
  );

  const handlePathMouseLeave = useCallback(() => {
    setLocalHoveredPlaceId(null);
    onPlaceHover(null);
  }, [onPlaceHover]);

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
      updateTooltip(event);
    },
    [handleScrub, updateTooltip],
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    onTooltipChange(null);
  }, [onTooltipChange]);

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
        const isHovered = activeHoveredPlaceId === data.placeId;
        const isDimmed = activeHoveredPlaceId && !isHovered;

        return (
          <path
            key={data.placeId}
            d={generateAreaPath(data.baseValues, data.topValues, 100, 100)}
            fill={data.color}
            stroke={data.color}
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
            opacity={isDimmed ? 0.3 : isHovered ? 1 : 0.7}
            style={{ transition: "opacity 0.15s ease", cursor: "pointer" }}
            onMouseEnter={() => handlePathMouseEnter(data.placeId)}
            onMouseLeave={handlePathMouseLeave}
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
  const { simulation } = use(SimulationContext);
  const compartmentData = useCompartmentData();

  // Shared legend state - persists across chart type switches
  const [hiddenPlaces, setHiddenPlaces] = useState<Set<string>>(new Set());
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);

  // Tooltip state
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const legendState: LegendState = useMemo(
    () => ({ hiddenPlaces, hoveredPlaceId }),
    [hiddenPlaces, hoveredPlaceId],
  );

  // Compute Y-axis scale based on data and chart type
  const yAxisScale = useYAxisScale(compartmentData, chartType, hiddenPlaces);

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

  const handleTooltipChange = useCallback((newTooltip: TooltipState | null) => {
    setTooltip(newTooltip);
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
      <div className={chartRowStyle}>
        <YAxis scale={yAxisScale} />
        <div className={chartContainerStyle}>
          {chartType === "stacked" ? (
            <StackedAreaChart
              compartmentData={compartmentData}
              legendState={legendState}
              yAxisScale={yAxisScale}
              onTooltipChange={handleTooltipChange}
              onPlaceHover={handleHover}
            />
          ) : (
            <CompartmentTimeSeries
              compartmentData={compartmentData}
              legendState={legendState}
              yAxisScale={yAxisScale}
              onTooltipChange={handleTooltipChange}
              onPlaceHover={handleHover}
            />
          )}
          <PlayheadIndicator totalFrames={totalFrames} />
        </div>
      </div>
      <TimelineLegend
        compartmentData={compartmentData}
        hiddenPlaces={hiddenPlaces}
        hoveredPlaceId={hoveredPlaceId}
        onToggleVisibility={togglePlaceVisibility}
        onHover={handleHover}
      />
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
};

/**
 * SubView definition for Simulation Timeline tab.
 * This tab is visible when simulation is running, paused, or complete.
 */
export const simulationTimelineSubView: SubView = {
  id: "simulation-timeline",
  title: "Timeline",
  tooltip:
    "View the simulation timeline with compartment time-series. Click/drag to scrub through frames.",
  component: SimulationTimelineContent,
  renderHeaderAction: () => <TimelineChartTypeSelector />,
};
