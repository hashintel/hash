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

export type FlightPosition = {
  entityId?: EntityId;
  flight: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  heading?: number;
};

type WorldMapRendererProps = {
  flights: FlightPosition[];
  onFlightClick?: (entityId: EntityId) => void;
};

/**
 * SVG viewBox dimensions for the world map.
 * The SVG uses viewBox="0 0 2000 857"
 */
const SVG_WIDTH = 2000;
const SVG_HEIGHT = 857;

/**
 * Convert geographic coordinates (lat/lng) to SVG coordinates.
 * The world map SVG uses a simple equirectangular projection:
 * - x: 0 to 2000 represents longitude -180 to 180
 * - y: 0 to 857 represents latitude 90 to -90 (inverted)
 */
const geoToSvgCoords = (
  latitude: number,
  longitude: number,
): [number, number] => {
  const svgX = ((longitude + 180) / 360) * SVG_WIDTH;
  const svgY = ((90 - latitude) / 180) * SVG_HEIGHT;
  return [svgX, svgY];
};

// Track if map is registered
let mapRegistered = false;
let mapSvgContent: string | null = null;

export const WorldMapRenderer = ({
  flights,
  onFlightClick,
}: WorldMapRendererProps) => {
  const [isMapReady, setIsMapReady] = useState(mapRegistered);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const loadAndRegisterMap = async () => {
      if (mapRegistered && mapSvgContent) {
        setIsMapReady(true);
        return;
      }

      try {
        // Load the SVG file from public folder
        const response = await fetch("/assets/world-map.svg");

        if (!response.ok) {
          throw new Error(`Failed to load map: ${response.status}`);
        }

        mapSvgContent = await response.text();
        echarts.registerMap("world_svg", { svg: mapSvgContent });
        mapRegistered = true;
        setIsMapReady(true);
      } catch {
        // Fallback to inline simple world map
        const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 857" width="2000" height="857">
          <rect x="0" y="0" width="2000" height="857" fill="#e8f4fc"/>
          <g stroke="#cde4f4" stroke-width="1" fill="none">
            <line x1="0" y1="428" x2="2000" y2="428"/>
            <line x1="1000" y1="0" x2="1000" y2="857"/>
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
      const data = params.data as { entityId?: EntityId } | undefined;
      if (data?.entityId && onFlightClick) {
        onFlightClick(data.entityId);
      }
    },
    [onFlightClick],
  );

  const option: ECOption = useMemo(() => {
    if (!isMapReady) {
      return {};
    }

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const tooltipData = params as {
            name?: string;
            data?: {
              lat?: number;
              lng?: number;
              altitude?: number;
              heading?: number;
            };
          };
          if (tooltipData.data) {
            let tooltip = `<strong>${tooltipData.name ?? "Flight"}</strong><br/>`;
            if (tooltipData.data.lng !== undefined) {
              tooltip += `Longitude: ${tooltipData.data.lng.toFixed(2)}°<br/>`;
            }
            if (tooltipData.data.lat !== undefined) {
              tooltip += `Latitude: ${tooltipData.data.lat.toFixed(2)}°`;
            }
            if (tooltipData.data.altitude) {
              tooltip += `<br/>Altitude: ${tooltipData.data.altitude.toLocaleString()} ft`;
            }
            if (tooltipData.data.heading !== undefined) {
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
        layoutSize: "130%",
        aspectScale: 1,
        itemStyle: {
          borderColor: "#999",
          borderWidth: 0.5,
        },
        emphasis: {
          itemStyle: {
            areaColor: undefined,
          },
          label: {
            show: false,
          },
        },
      },
      series: [
        {
          type: "scatter",
          coordinateSystem: "geo",
          geoIndex: 0,
          data: flights.map((flight) => {
            const [svgX, svgY] = geoToSvgCoords(
              flight.latitude,
              flight.longitude,
            );
            return {
              name: flight.flight,
              value: [svgX, svgY],
              entityId: flight.entityId,
              lat: flight.latitude,
              lng: flight.longitude,
              altitude: flight.altitude,
              heading: flight.heading,
            };
          }),
          symbol: "path://M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z",
          symbolSize: 18,
          symbolRotate: 0,
          itemStyle: {
            color: "#ef4444",
            shadowBlur: 6,
            shadowColor: "rgba(239, 68, 68, 0.6)",
          },
          emphasis: {
            scale: 1.5,
            itemStyle: {
              color: "#dc2626",
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

  const handleChartInit = useCallback(
    (chart: Chart) => {
      chartRef.current = chart;
      // Bind click event
      chart.on("click", "series.scatter", handleChartClick);
    },
    [handleChartClick],
  );

  return <EChart options={option} onChartInitialized={handleChartInit} />;
};
