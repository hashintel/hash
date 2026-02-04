/**
 * Dashboard item generator for airline operator demo.
 *
 * This file generates dashboard items from the flight data to demonstrate
 * various chart types and visualizations.
 */
import type { EntityId } from "@blockprotocol/type-system";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import type { DashboardItemData } from "../shared/types";
import { flightsWithLinksResolved } from "./dummy-data";

type SimplifiedFlight = {
  entityId: EntityId;
  flightNumber: string;
  flightStatus: string;
  flightDate: string;
  flightType: string;
  iataCode: string;
  icaoCode: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  groundSpeed?: number;
  direction?: number;
  isOnGround?: boolean;
};

type SimplifiedAirport = {
  entityId: EntityId;
  name: string;
  city: string;
  iataCode: string;
  icaoCode: string;
  timezone: string;
};

type SimplifiedAirline = {
  entityId: EntityId;
  name: string;
  iataCode: string;
  icaoCode: string;
};

type SimplifiedDepartureArrival = {
  scheduledGateTime?: string;
  scheduledRunwayTime?: string;
  estimatedGateTime?: string;
  estimatedRunwayTime?: string;
  actualGateTime?: string;
  actualRunwayTime?: string;
  delayInSeconds?: number;
  gate?: string;
  terminal?: string;
};

type ProcessedFlightData = {
  flight: SimplifiedFlight;
  departureAirport: SimplifiedAirport;
  arrivalAirport: SimplifiedAirport;
  airline: SimplifiedAirline;
  departure: SimplifiedDepartureArrival;
  arrival: SimplifiedDepartureArrival;
};

/**
 * Process the raw flight data into a simplified format.
 */
const processFlightData = (): ProcessedFlightData[] => {
  return flightsWithLinksResolved.map((item) => {
    const flightProps = simplifyProperties(item.flight.properties);
    const departureAirportProps = simplifyProperties(
      item.departureAirport.properties,
    );
    const arrivalAirportProps = simplifyProperties(
      item.arrivalAirport.properties,
    );
    const airlineProps = simplifyProperties(item.operatedBy.properties);
    const departureProps = simplifyProperties(item.departureStatus.properties);
    const arrivalProps = simplifyProperties(item.arrivalStatus.properties);

    return {
      flight: {
        entityId: item.flight.metadata.recordId.entityId as EntityId,
        flightNumber: String(flightProps.flightNumber),
        flightStatus: flightProps.flightStatus
          ? String(flightProps.flightStatus)
          : "Unknown",
        flightDate: flightProps.flightDate
          ? String(flightProps.flightDate)
          : "",
        flightType: flightProps.flightType
          ? String(flightProps.flightType)
          : "",
        iataCode: flightProps.iataCode ? String(flightProps.iataCode) : "",
        icaoCode: flightProps.icaoCode ? String(flightProps.icaoCode) : "",
        latitude:
          typeof flightProps.latitude === "number"
            ? flightProps.latitude
            : undefined,
        longitude:
          typeof flightProps.longitude === "number"
            ? flightProps.longitude
            : undefined,
        altitude:
          typeof flightProps.altitude === "number"
            ? flightProps.altitude
            : undefined,
        groundSpeed:
          typeof flightProps.groundSpeed === "number"
            ? flightProps.groundSpeed
            : undefined,
        direction:
          typeof flightProps.direction === "number"
            ? flightProps.direction
            : undefined,
        isOnGround:
          typeof flightProps.isOnGround === "boolean"
            ? flightProps.isOnGround
            : undefined,
      },
      departureAirport: {
        entityId: item.departureAirport.metadata.recordId.entityId as EntityId,
        name: departureAirportProps.name
          ? String(departureAirportProps.name)
          : "",
        city: departureAirportProps.city
          ? String(departureAirportProps.city)
          : "",
        iataCode: departureAirportProps.iataCode
          ? String(departureAirportProps.iataCode)
          : "",
        icaoCode: departureAirportProps.icaoCode
          ? String(departureAirportProps.icaoCode)
          : "",
        timezone: departureAirportProps.timezone
          ? String(departureAirportProps.timezone)
          : "",
      },
      arrivalAirport: {
        entityId: item.arrivalAirport.metadata.recordId.entityId as EntityId,
        name: arrivalAirportProps.name ? String(arrivalAirportProps.name) : "",
        city: arrivalAirportProps.city ? String(arrivalAirportProps.city) : "",
        iataCode: arrivalAirportProps.iataCode
          ? String(arrivalAirportProps.iataCode)
          : "",
        icaoCode: arrivalAirportProps.icaoCode
          ? String(arrivalAirportProps.icaoCode)
          : "",
        timezone: arrivalAirportProps.timezone
          ? String(arrivalAirportProps.timezone)
          : "",
      },
      airline: {
        entityId: item.operatedBy.metadata.recordId.entityId as EntityId,
        name: airlineProps.name ? String(airlineProps.name) : "",
        iataCode: airlineProps.iataCode ? String(airlineProps.iataCode) : "",
        icaoCode: airlineProps.icaoCode ? String(airlineProps.icaoCode) : "",
      },
      departure: {
        scheduledGateTime:
          typeof departureProps.scheduledGateTime === "string"
            ? departureProps.scheduledGateTime
            : undefined,
        scheduledRunwayTime:
          typeof departureProps.scheduledRunwayTime === "string"
            ? departureProps.scheduledRunwayTime
            : undefined,
        estimatedGateTime:
          typeof departureProps.estimatedGateTime === "string"
            ? departureProps.estimatedGateTime
            : undefined,
        estimatedRunwayTime:
          typeof departureProps.estimatedRunwayTime === "string"
            ? departureProps.estimatedRunwayTime
            : undefined,
        actualGateTime:
          typeof departureProps.actualGateTime === "string"
            ? departureProps.actualGateTime
            : undefined,
        actualRunwayTime:
          typeof departureProps.actualRunwayTime === "string"
            ? departureProps.actualRunwayTime
            : undefined,
        delayInSeconds:
          typeof departureProps.delayInSeconds === "number"
            ? departureProps.delayInSeconds
            : undefined,
        gate:
          typeof departureProps.gate === "string"
            ? departureProps.gate
            : undefined,
        terminal:
          typeof departureProps.terminal === "string"
            ? departureProps.terminal
            : undefined,
      },
      arrival: {
        scheduledGateTime:
          typeof arrivalProps.scheduledGateTime === "string"
            ? arrivalProps.scheduledGateTime
            : undefined,
        scheduledRunwayTime:
          typeof arrivalProps.scheduledRunwayTime === "string"
            ? arrivalProps.scheduledRunwayTime
            : undefined,
        estimatedGateTime:
          typeof arrivalProps.estimatedGateTime === "string"
            ? arrivalProps.estimatedGateTime
            : undefined,
        estimatedRunwayTime:
          typeof arrivalProps.estimatedRunwayTime === "string"
            ? arrivalProps.estimatedRunwayTime
            : undefined,
        actualGateTime:
          typeof arrivalProps.actualGateTime === "string"
            ? arrivalProps.actualGateTime
            : undefined,
        actualRunwayTime:
          typeof arrivalProps.actualRunwayTime === "string"
            ? arrivalProps.actualRunwayTime
            : undefined,
        delayInSeconds:
          typeof arrivalProps.delayInSeconds === "number"
            ? arrivalProps.delayInSeconds
            : undefined,
        gate:
          typeof arrivalProps.gate === "string" ? arrivalProps.gate : undefined,
        terminal:
          typeof arrivalProps.terminal === "string"
            ? arrivalProps.terminal
            : undefined,
      },
    };
  });
};

/**
 * Generate chart data for flight status breakdown (pie chart).
 */
const generateFlightStatusData = (data: ProcessedFlightData[]) => {
  const statusCounts: Record<string, number> = {};

  for (const item of data) {
    const status = item.flight.flightStatus || "Unknown";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  return Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
  }));
};

/**
 * Generate chart data for flights by airline (bar chart).
 * Each bar includes the airline entity ID for click interactions.
 */
const generateFlightsByAirlineData = (data: ProcessedFlightData[]) => {
  const airlineData: Record<string, { count: number; entityId: EntityId }> = {};

  for (const item of data) {
    const airline = item.airline.name || item.airline.iataCode || "Unknown";
    if (!airlineData[airline]) {
      airlineData[airline] = { count: 0, entityId: item.airline.entityId };
    }
    airlineData[airline].count += 1;
  }

  return Object.entries(airlineData)
    .map(([airline, { count, entityId }]) => ({
      entityId,
      airline,
      flights: count,
    }))
    .sort((a, b) => b.flights - a.flights)
    .slice(0, 10); // Top 10 airlines
};

/**
 * Generate chart data for departure delays (bar chart).
 * Each bar represents a single flight with its entity ID.
 */
const generateDelayData = (data: ProcessedFlightData[]) => {
  return data
    .filter((item) => item.departure.delayInSeconds !== undefined)
    .map((item) => ({
      entityId: item.flight.entityId,
      flight: item.flight.flightNumber,
      delayMinutes: Math.round((item.departure.delayInSeconds ?? 0) / 60),
      route: `${item.departureAirport.iataCode}-${item.arrivalAirport.iataCode}`,
    }))
    .filter((item) => item.delayMinutes !== 0)
    .sort((a, b) => Math.abs(b.delayMinutes) - Math.abs(a.delayMinutes))
    .slice(0, 15); // Top 15 delays
};

/**
 * Generate chart data for flights by departure airport (bar chart).
 */
const generateFlightsByDepartureAirportData = (data: ProcessedFlightData[]) => {
  const airportCounts: Record<string, number> = {};

  for (const item of data) {
    const airport =
      item.departureAirport.iataCode || item.departureAirport.name || "Unknown";
    airportCounts[airport] = (airportCounts[airport] ?? 0) + 1;
  }

  return Object.entries(airportCounts)
    .map(([airport, count]) => ({
      airport,
      departures: count,
    }))
    .sort((a, b) => b.departures - a.departures)
    .slice(0, 10); // Top 10 airports
};

/**
 * Generate chart data for flights by arrival airport (bar chart).
 * Note: Not used for Newquay dashboard since all flights arrive at NQY.
 */
const _generateFlightsByArrivalAirportData = (data: ProcessedFlightData[]) => {
  const airportCounts: Record<string, number> = {};

  for (const item of data) {
    const airport =
      item.arrivalAirport.iataCode || item.arrivalAirport.name || "Unknown";
    airportCounts[airport] = (airportCounts[airport] ?? 0) + 1;
  }

  return Object.entries(airportCounts)
    .map(([airport, count]) => ({
      airport,
      arrivals: count,
    }))
    .sort((a, b) => b.arrivals - a.arrivals)
    .slice(0, 10); // Top 10 airports
};

/**
 * Generate chart data for flight schedule table.
 */
const generateScheduleTableData = (data: ProcessedFlightData[]) => {
  const formatTime = (isoString?: string): string => {
    if (!isoString) {
      return "-";
    }
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return "-";
    }
  };

  return data.slice(0, 20).map((item) => ({
    flight: item.flight.flightNumber,
    airline: item.airline.iataCode || item.airline.name,
    route: `${item.departureAirport.iataCode} → ${item.arrivalAirport.iataCode}`,
    schedDep: formatTime(item.departure.scheduledGateTime),
    estDep: formatTime(item.departure.estimatedGateTime),
    schedArr: formatTime(item.arrival.scheduledGateTime),
    estArr: formatTime(item.arrival.estimatedGateTime),
    status: item.flight.flightStatus,
  }));
};

/**
 * Generate chart data for flights with position data (scatter chart).
 * Shows flights that have lat/lng coordinates.
 */
const generateFlightPositionsData = (data: ProcessedFlightData[]) => {
  return data
    .filter(
      (item) =>
        item.flight.latitude !== undefined &&
        item.flight.longitude !== undefined,
    )
    .map((item) => ({
      entityId: item.flight.entityId,
      flight: item.flight.flightNumber,
      latitude: item.flight.latitude,
      longitude: item.flight.longitude,
      altitude: item.flight.altitude ?? 0,
      groundSpeed: item.flight.groundSpeed ?? 0,
      status: item.flight.flightStatus,
      route: `${item.departureAirport.iataCode}-${item.arrivalAirport.iataCode}`,
    }));
};

/**
 * Generate chart data for top routes (bar chart).
 */
const generateTopRoutesData = (data: ProcessedFlightData[]) => {
  const routeCounts: Record<string, number> = {};

  for (const item of data) {
    const route = `${item.departureAirport.iataCode}→${item.arrivalAirport.iataCode}`;
    routeCounts[route] = (routeCounts[route] ?? 0) + 1;
  }

  return Object.entries(routeCounts)
    .map(([route, count]) => ({
      route,
      flights: count,
    }))
    .sort((a, b) => b.flights - a.flights)
    .slice(0, 8); // Top 8 routes
};

/**
 * Generate chart data showing scheduled departure times distribution.
 */
const generateDepartureTimeDistributionData = (data: ProcessedFlightData[]) => {
  const hourCounts: Record<number, number> = {};

  for (const item of data) {
    const depTime = item.departure.scheduledGateTime;
    if (depTime) {
      try {
        const date = new Date(depTime);
        const hour = date.getUTCHours();
        hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
      } catch {
        // Ignore invalid dates
      }
    }
  }

  // Fill in all hours 0-23
  return Array.from({ length: 24 }, (_, hour) => ({
    hour: `${hour.toString().padStart(2, "0")}:00`,
    flights: hourCounts[hour] ?? 0,
  }));
};

/**
 * Arrivals board status type.
 */
type ArrivalsBoardStatus =
  | "On Time"
  | "Landing"
  | "Delayed"
  | "Landed"
  | "Cancelled";

/**
 * Generate arrivals board data for the classic airport display.
 * For Newquay Airport - shows incoming flights sorted chronologically.
 */
const generateArrivalsBoardData = (data: ProcessedFlightData[]) => {
  const formatTime = (isoString?: string): string => {
    if (!isoString) {
      return "--:--";
    }
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return "--:--";
    }
  };

  const mapStatus = (
    flightStatus: string,
    delaySeconds?: number,
  ): ArrivalsBoardStatus => {
    switch (flightStatus) {
      case "Active":
        return "Landing";
      case "Landed":
        return "Landed";
      case "Cancelled":
        return "Cancelled";
      case "Scheduled":
        if (delaySeconds && delaySeconds > 300) {
          // More than 5 min delay
          return "Delayed";
        }
        return "On Time";
      default:
        return "On Time";
    }
  };

  // Sort by scheduled arrival time chronologically
  const sortedData = [...data].sort((a, b) => {
    const timeA = a.arrival.scheduledGateTime
      ? new Date(a.arrival.scheduledGateTime).getTime()
      : Infinity;
    const timeB = b.arrival.scheduledGateTime
      ? new Date(b.arrival.scheduledGateTime).getTime()
      : Infinity;
    return timeA - timeB;
  });

  return sortedData.slice(0, 12).map((item) => ({
    entityId: item.flight.entityId,
    flight: item.flight.flightNumber,
    // For arrivals, show the origin (departure airport)
    origin: `${item.departureAirport.city || item.departureAirport.name} (${item.departureAirport.iataCode})`,
    scheduledTime: formatTime(item.arrival.scheduledGateTime),
    estimatedTime: formatTime(item.arrival.estimatedGateTime),
    gate: item.arrival.gate ?? "-",
    status: mapStatus(item.flight.flightStatus, item.arrival.delayInSeconds),
  }));
};

/**
 * Create a dashboard item with the given configuration.
 */
const createDashboardItem = (
  id: string,
  title: string,
  chartType: ChartType,
  chartData: unknown[],
  chartConfig: ChartConfig,
  gridPosition: { x: number; y: number; w: number; h: number },
): DashboardItemData => ({
  entityId: `demo-entity-${id}` as DashboardItemData["entityId"],
  linkEntityId: `demo-link-${id}` as DashboardItemData["linkEntityId"],
  title,
  userGoal: `Display ${title.toLowerCase()}`,
  chartType,
  chartData,
  chartConfig,
  gridPosition: {
    i: id,
    ...gridPosition,
  },
  configurationStatus: "ready",
});

/**
 * Create a custom dashboard item (non-ECharts) without chartConfig.
 * Custom chart types like "departure-board" are handled by CustomRenderer.
 */
const createCustomDashboardItem = (
  id: string,
  title: string,
  chartType: string, // Custom types like "departure-board"
  chartData: unknown[],
  gridPosition: { x: number; y: number; w: number; h: number },
): DashboardItemData => ({
  entityId: `demo-entity-${id}` as DashboardItemData["entityId"],
  linkEntityId: `demo-link-${id}` as DashboardItemData["linkEntityId"],
  title,
  userGoal: `Display ${title.toLowerCase()}`,
  chartType,
  chartData,
  chartConfig: null,
  gridPosition: {
    i: id,
    ...gridPosition,
  },
  configurationStatus: "ready",
});

/**
 * Generate all dashboard items for the airline operator demo.
 */
export const generateDashboardItems = (): DashboardItemData[] => {
  const processedData = processFlightData();
  const items: DashboardItemData[] = [];

  // 1. Arrivals Board (Custom Component) - Top, full width, prominent
  const arrivalsBoardData = generateArrivalsBoardData(processedData);
  items.push(
    createCustomDashboardItem(
      "arrivals-board",
      "Arrivals - Newquay Airport (NQY)",
      "flight-board",
      arrivalsBoardData,
      { x: 0, y: 0, w: 12, h: 7 },
    ),
  );

  // 2. Flight Positions World Map - Second row, full width
  const positionData = generateFlightPositionsData(processedData);
  if (positionData.length > 0) {
    items.push(
      createCustomDashboardItem(
        "flight-positions",
        "Live Flight Positions",
        "world-map",
        positionData,
        { x: 0, y: 7, w: 12, h: 8 },
      ),
    );
  }

  // 3. Flight Status Breakdown (Pie Chart) - Third row left
  const statusData = generateFlightStatusData(processedData);
  items.push(
    createDashboardItem(
      "flight-status",
      "Flight Status Overview",
      "pie",
      statusData,
      {
        categoryKey: "status",
        series: [
          {
            type: "pie",
            dataKey: "count",
            name: "Flights",
            radius: ["40%", "70%"],
          },
        ],
        showLegend: true,
        showTooltip: true,
        colors: ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"],
      },
      { x: 0, y: 15, w: 4, h: 6 },
    ),
  );

  // 4. Flights by Airline (Bar Chart) - Third row center
  const airlineData = generateFlightsByAirlineData(processedData);
  items.push(
    createDashboardItem(
      "flights-by-airline",
      "Flights by Airline",
      "bar",
      airlineData,
      {
        categoryKey: "airline",
        series: [
          {
            type: "bar",
            dataKey: "flights",
            name: "Flights",
            color: "#3b82f6",
          },
        ],
        xAxisLabel: "Airline",
        yAxisLabel: "Number of Flights",
        showLegend: false,
        showTooltip: true,
        showGrid: true,
      },
      { x: 4, y: 15, w: 4, h: 6 },
    ),
  );

  // 5. Top Routes (Bar Chart) - Third row right
  const routesData = generateTopRoutesData(processedData);
  items.push(
    createDashboardItem(
      "top-routes",
      "Top Flight Routes",
      "bar",
      routesData,
      {
        categoryKey: "route",
        series: [
          {
            type: "bar",
            dataKey: "flights",
            name: "Flights",
            color: "#14b8a6",
          },
        ],
        xAxisLabel: "Route",
        yAxisLabel: "Flights",
        showLegend: false,
        showTooltip: true,
        showGrid: true,
      },
      { x: 8, y: 15, w: 4, h: 6 },
    ),
  );

  // 6. Arrivals by Hour (Line Chart) - Fourth row left
  const timeDistData = generateDepartureTimeDistributionData(processedData);
  items.push(
    createDashboardItem(
      "arrivals-distribution",
      "Arrivals by Hour (UTC)",
      "line",
      timeDistData,
      {
        categoryKey: "hour",
        series: [
          {
            type: "line",
            dataKey: "flights",
            name: "Flights",
            color: "#8b5cf6",
            smooth: true,
            areaStyle: { opacity: 0.3 },
          },
        ],
        xAxisLabel: "Hour (UTC)",
        yAxisLabel: "Number of Flights",
        showLegend: false,
        showTooltip: true,
        showGrid: true,
      },
      { x: 0, y: 21, w: 6, h: 6 },
    ),
  );

  // 7. Flight Delays (Bar Chart) - Fourth row right
  const delayData = generateDelayData(processedData);
  if (delayData.length > 0) {
    items.push(
      createDashboardItem(
        "flight-delays",
        "Flight Delays",
        "bar",
        delayData,
        {
          categoryKey: "flight",
          series: [
            {
              type: "bar",
              dataKey: "delayMinutes",
              name: "Delay (min)",
              color: "#ef4444",
            },
          ],
          xAxisLabel: "Flight Number",
          yAxisLabel: "Delay (minutes)",
          showLegend: false,
          showTooltip: true,
          showGrid: true,
        },
        { x: 6, y: 21, w: 6, h: 6 },
      ),
    );
  } else {
    // If no delays, show top origin airports instead
    const depAirportData = generateFlightsByDepartureAirportData(processedData);
    items.push(
      createDashboardItem(
        "origin-airports-alt",
        "Top Origin Airports",
        "bar",
        depAirportData,
        {
          categoryKey: "airport",
          series: [
            {
              type: "bar",
              dataKey: "departures",
              name: "Flights",
              color: "#22c55e",
            },
          ],
          xAxisLabel: "Airport Code",
          yAxisLabel: "Number of Flights",
          showLegend: false,
          showTooltip: true,
          showGrid: true,
        },
        { x: 6, y: 21, w: 6, h: 6 },
      ),
    );
  }

  return items;
};

/**
 * Generate schedule table data for use outside charts.
 * This can be used with a table component if needed.
 */
export const getScheduleTableData = () => {
  const processedData = processFlightData();
  return generateScheduleTableData(processedData);
};

/**
 * Get summary statistics for the flight data.
 */
export const getFlightSummary = () => {
  const processedData = processFlightData();

  const statusCounts = generateFlightStatusData(processedData);
  const totalFlights = processedData.length;
  const airlinesCount = new Set(
    processedData.map((flight) => flight.airline.name),
  ).size;
  const departureAirportsCount = new Set(
    processedData.map((flight) => flight.departureAirport.iataCode),
  ).size;
  const arrivalAirportsCount = new Set(
    processedData.map((flight) => flight.arrivalAirport.iataCode),
  ).size;

  return {
    totalFlights,
    airlinesCount,
    departureAirportsCount,
    arrivalAirportsCount,
    statusBreakdown: statusCounts,
  };
};
