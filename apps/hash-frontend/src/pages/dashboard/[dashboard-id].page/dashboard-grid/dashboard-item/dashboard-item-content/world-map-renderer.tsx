/**
 * World Map Renderer Component
 *
 * Uses ECharts with SVG-based geo map to display flight positions.
 * Based on: https://echarts.apache.org/handbook/en/how-to/component-types/geo/svg-base-map/
 */
import type { EntityId } from "@blockprotocol/type-system";
import type { Chart, ECOption } from "@hashintel/design-system";
import { EChart } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import * as echarts from "echarts";
import type { ECElementEvent } from "echarts/types/dist/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Status used for arrow color: green = on time, red = delayed */
export type FlightPosition = {
  entityId: EntityId | null;
  flight: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  heading: number | null;
  /** When set, arrow is green (on time) or red (delayed). */
  status?:
    | "On Time"
    | "Delayed"
    | "Landed"
    | "Cancelled"
    | "Boarding"
    | "Departed";
};

type WorldMapRendererProps = {
  flights: FlightPosition[];
  onFlightClick?: (entityId: EntityId) => void;
  /** When set, matching flight is highlighted blue and map pans to it. */
  hoveredEntityId?: EntityId | null;
  onHoveredEntityChange?: (entityId: EntityId | null) => void;
};

/**
 * SVG viewBox dimensions for the world map.
 * The SVG uses viewBox="0 0 1874 798"
 */
const SVG_WIDTH = 1874;
const SVG_HEIGHT = 798;

/**
 * Calibration offsets determined by comparing known geographic locations
 * (Ireland at ~53°N, -6°W appears at ~845, 150 in the SVG).
 *
 * Equirectangular formula gives: x=904, y=162 for Dublin
 * Actual SVG position: ~845, 150
 * Reduced offset after testing.
 */
const SVG_X_OFFSET = -48;
const SVG_Y_OFFSET = -12;

/**
 * Convert geographic coordinates (lat/lng) to SVG coordinates.
 *
 * Uses equirectangular projection with empirical calibration offsets
 * to match the SVG map's actual coordinate system.
 */
const geoToSvgCoords = (
  latitude: number,
  longitude: number,
): [number, number] => {
  // Base equirectangular projection
  const baseX = ((longitude + 180) / 360) * SVG_WIDTH;
  const baseY = ((90 - latitude) / 180) * SVG_HEIGHT;

  // Apply calibration offsets
  const svgX = baseX + SVG_X_OFFSET;
  const svgY = baseY + SVG_Y_OFFSET;

  return [svgX, svgY];
};

// Track if map is registered
let mapRegistered = false;
let mapSvgContent: string | null = null;

/**
 * Arrow styles per flight status.
 *  - On time: light green fill with dark green border for contrast
 *  - Delayed / cancelled: darker red fill with dark red border
 *  - Hovered (any status): blue fill with blue glow
 */
type ArrowStyle = {
  color: string;
  borderColor: string;
  borderWidth: number;
  shadowBlur: number;
  shadowColor: string;
};

const ARROW_STYLE: Record<"onTime" | "delayed" | "hovered", ArrowStyle> = {
  onTime: {
    color: "#86EFAC",
    borderColor: "#166534",
    borderWidth: 1.5,
    shadowBlur: 0,
    shadowColor: "transparent",
  },
  delayed: {
    color: "#DC2626",
    borderColor: "#7F1D1D",
    borderWidth: 1.5,
    shadowBlur: 0,
    shadowColor: "transparent",
  },
  hovered: {
    color: "#3B82F6",
    borderColor: "#1E40AF",
    borderWidth: 1.5,
    shadowBlur: 6,
    shadowColor: "rgba(59, 130, 246, 0.6)",
  },
};

const getArrowStyle = (
  flight: FlightPosition,
  hoveredEntityId: EntityId | null | undefined,
): ArrowStyle => {
  if (hoveredEntityId != null && flight.entityId === hoveredEntityId) {
    return ARROW_STYLE.hovered;
  }
  if (flight.status === "Delayed" || flight.status === "Cancelled") {
    return ARROW_STYLE.delayed;
  }
  return ARROW_STYLE.onTime;
};

/** Build the scatter series data array, optionally highlighting one entity. */
const buildSeriesData = (
  flights: FlightPosition[],
  hoveredEntityId?: EntityId | null,
) =>
  flights.map((flight) => {
    const [svgX, svgY] = geoToSvgCoords(flight.latitude, flight.longitude);
    const style = getArrowStyle(flight, hoveredEntityId);
    return {
      name: flight.flight,
      value: [svgX, svgY],
      entityId: flight.entityId,
      lat: flight.latitude,
      lng: flight.longitude,
      altitude: flight.altitude,
      heading: flight.heading,
      symbolRotate: flight.heading !== null ? -flight.heading : 0,
      itemStyle: {
        color: style.color,
        borderColor: style.borderColor,
        borderWidth: style.borderWidth,
        shadowBlur: style.shadowBlur,
        shadowColor: style.shadowColor,
      },
    };
  });

export const WorldMapRenderer = ({
  flights,
  onFlightClick,
  hoveredEntityId,
  onHoveredEntityChange,
}: WorldMapRendererProps) => {
  const [isMapReady, setIsMapReady] = useState(mapRegistered);
  const chartRef = useRef<Chart | null>(null);
  /** True while the user's mouse is over a flight marker in THIS component. */
  const isLocalHover = useRef(false);

  useEffect(() => {
    const loadAndRegisterMap = async () => {
      if (mapRegistered && mapSvgContent) {
        setIsMapReady(true);
        return;
      }

      try {
        // Load the SVG file from public folder
        const response = await fetch("/assets/world-map-natural-earth-ii.svg");

        if (!response.ok) {
          throw new Error(`Failed to load map: ${response.status}`);
        }

        let svgContent = await response.text();

        svgContent = svgContent.replace(
          /<path\s/g,
          '<path style="fill:white;stroke:#9CA3AF;stroke-width:0.8" ',
        );

        mapSvgContent = svgContent;
        echarts.registerMap("world_svg", { svg: mapSvgContent });
        mapRegistered = true;
        setIsMapReady(true);
      } catch {
        // Fallback to inline simple world map (matching Natural Earth II dimensions)
        const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1874 798" width="1874" height="798">
          <rect x="0" y="0" width="1874" height="798" fill="#e8f4fc"/>
          <g stroke="#cde4f4" stroke-width="1" fill="none">
            <line x1="0" y1="399" x2="1874" y2="399"/>
            <line x1="937" y1="0" x2="937" y2="798"/>
          </g>
        </svg>`;
        echarts.registerMap("world_svg", { svg: fallbackSvg });
        mapRegistered = true;
        setIsMapReady(true);
      }
    };

    void loadAndRegisterMap();
  }, []);

  // Handle chart click events
  const handleChartClick = useCallback(
    (params: ECElementEvent) => {
      const data = params.data as { entityId: EntityId | null } | undefined;
      if (
        data?.entityId !== null &&
        data?.entityId !== undefined &&
        onFlightClick
      ) {
        onFlightClick(data.entityId);
      }
    },
    [onFlightClick],
  );

  // Sync hover to dashboard-wide state so other components (e.g. flight board) can highlight
  const handleChartMouseOver = useCallback(
    (params: ECElementEvent) => {
      const data = params.data as { entityId: EntityId | null } | undefined;
      if (data?.entityId != null && onHoveredEntityChange) {
        isLocalHover.current = true;
        onHoveredEntityChange(data.entityId);
      }
    },
    [onHoveredEntityChange],
  );

  // Fires when the mouse leaves a specific scatter marker (not just the whole chart).
  const handleChartMouseOut = useCallback(() => {
    isLocalHover.current = false;
    if (onHoveredEntityChange) {
      onHoveredEntityChange(null);
    }
  }, [onHoveredEntityChange]);

  const handleChartInit = useCallback(
    (chart: Chart) => {
      chartRef.current = chart;
      chart.on("click", "series.scatter", handleChartClick);
      chart.on("mouseover", "series.scatter", handleChartMouseOver);
      chart.on("mouseout", "series.scatter", handleChartMouseOut);
    },
    [handleChartClick, handleChartMouseOver, handleChartMouseOut],
  );

  /**
   * Imperatively update arrow colors and optionally pan when the hovered
   * entity changes. Avoids recalculating the full option useMemo on every
   * hover, keeping re-renders cheap.
   */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    // Always update arrow colors (cheap scatter data rebuild)
    const data = buildSeriesData(flights, hoveredEntityId);
    const update: Record<string, unknown> = {
      series: [{ data }],
    };

    // Pan only when the hover came from another component AND the point
    // isn't already visible in the current viewport.
    if (!isLocalHover.current && hoveredEntityId != null) {
      const flight = flights.find((f) => f.entityId === hoveredEntityId);
      if (flight) {
        const [svgX, svgY] = geoToSvgCoords(flight.latitude, flight.longitude);
        const isInView = chart.containPixel("geo", [svgX, svgY]);
        if (!isInView) {
          update.geo = { center: [svgX, svgY], zoom: 2.5 };
        }
      }
    }

    chart.setOption(update, { lazyUpdate: true });
  }, [hoveredEntityId, flights]);

  /**
   * Base ECharts option. Does NOT depend on hoveredEntityId — hover
   * visuals are applied imperatively in the effect above.
   */
  const option: ECOption = useMemo(() => {
    if (!isMapReady) {
      return {};
    }

    return {
      animationDurationUpdate: 300,
      animationEasingUpdate: "cubicOut",
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const tooltipData = params as {
            name?: string;
            data?: {
              lat: number | null;
              lng: number | null;
              altitude: number | null;
              heading: number | null;
            };
          };
          if (tooltipData.data) {
            let tooltip = `<strong>${tooltipData.name ?? "Flight"}</strong><br/>`;
            if (tooltipData.data.lat !== null) {
              tooltip += `Latitude: ${tooltipData.data.lat.toFixed(2)}°<br />`;
            }
            if (tooltipData.data.lng !== null) {
              tooltip += `Longitude: ${tooltipData.data.lng.toFixed(2)}°<br/>`;
            }
            if (tooltipData.data.altitude !== null) {
              tooltip += `<br/>Altitude: ${tooltipData.data.altitude.toLocaleString()} ft`;
            }
            if (tooltipData.data.heading !== null) {
              tooltip += `<br/>Heading: ${tooltipData.data.heading}°`;
            }
            return tooltip;
          }
          return "";
        },
      },
      geo: {
        map: "world_svg",
        roam: true,
        layoutCenter: ["50%", "50%"],
        layoutSize: "250%",
        aspectScale: 1,
        selectedMode: false,
        silent: true,
        regions: [],
        itemStyle: {
          areaColor: "#ffffff",
          borderColor: "#E4E7EC",
          borderWidth: 0.7,
        },
        emphasis: {
          itemStyle: {
            areaColor: "#ffffff",
            borderColor: "#E4E7EC",
          },
        },
        select: {
          itemStyle: {
            areaColor: "#ffffff",
          },
        },
      },
      series: [
        {
          type: "scatter",
          coordinateSystem: "geo",
          geoIndex: 0,
          data: buildSeriesData(flights),
          symbol: "path://M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z",
          symbolSize: 18,
          emphasis: {
            scale: 1.5,
            itemStyle: {
              borderColor: "#fff",
              borderWidth: 1,
            },
          },
          zlevel: 1,
        },
      ],
    } as ECOption;
  }, [flights, isMapReady]);

  if (!isMapReady) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <Typography color="text.secondary">Loading map...</Typography>
      </Box>
    );
  }

  if (flights.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <Typography color="text.secondary">
          No flight positions available
        </Typography>
      </Box>
    );
  }

  return <EChart options={option} onChartInitialized={handleChartInit} />;
};
