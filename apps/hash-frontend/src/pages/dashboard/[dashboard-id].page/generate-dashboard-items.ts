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
import type { FlightWithLinksResolved } from "./dummy-data";

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
const processFlightData = (
  flightData: FlightWithLinksResolved[],
): ProcessedFlightData[] => {
  return flightData.map((item) => {
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
        entityId: item.flight.metadata.recordId.entityId,
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
        entityId: item.departureAirport.metadata.recordId.entityId,
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
        entityId: item.arrivalAirport.metadata.recordId.entityId,
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
        entityId: item.operatedBy.metadata.recordId.entityId,
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
const _generateFlightsByAirlineData = (data: ProcessedFlightData[]) => {
  const airlineData: Record<string, { count: number; entityId: EntityId }> = {};

  for (const item of data) {
    const airline = item.airline.name || item.airline.iataCode || "Unknown";
    airlineData[airline] ??= { count: 0, entityId: item.airline.entityId };
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
const _generateDelayData = (data: ProcessedFlightData[]) => {
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
const _generateFlightsByDepartureAirportData = (
  data: ProcessedFlightData[],
) => {
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
      (
        item,
      ): item is ProcessedFlightData & {
        flight: ProcessedFlightData["flight"] & {
          latitude: number;
          longitude: number;
        };
      } =>
        item.flight.latitude !== undefined &&
        item.flight.longitude !== undefined,
    )
    .map((item) => ({
      entityId: item.flight.entityId,
      flight: item.flight.flightNumber,
      latitude: item.flight.latitude,
      longitude: item.flight.longitude,
      altitude: item.flight.altitude ?? null,
      heading: item.flight.direction ?? null,
    }));
};

/**
 * Generate chart data for top routes (bar chart).
 */
const _generateTopRoutesData = (data: ProcessedFlightData[]) => {
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
const _generateDepartureTimeDistributionData = (
  data: ProcessedFlightData[],
) => {
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
 * Generate daily delay trend data with 7-day rolling average.
 * Shows average delay per day over the entire date range.
 */
const generateDailyDelayTrendData = (data: ProcessedFlightData[]) => {
  const dailyDelays: Record<string, { totalDelay: number; count: number }> = {};

  for (const item of data) {
    const arrivalTime = item.arrival.scheduledGateTime;
    if (!arrivalTime) {
      continue;
    }

    try {
      const date = new Date(arrivalTime).toISOString().split("T")[0];
      if (!date) {
        continue;
      }

      dailyDelays[date] ??= { totalDelay: 0, count: 0 };
      dailyDelays[date].count += 1;

      // Add delay if present (convert seconds to minutes)
      if (item.arrival.delayInSeconds !== undefined) {
        dailyDelays[date].totalDelay += Math.max(
          0,
          item.arrival.delayInSeconds / 60,
        );
      }
    } catch {
      // Ignore invalid dates
    }
  }

  // Convert to sorted array
  const sortedDays = Object.entries(dailyDelays)
    .map(([date, { totalDelay, count }]) => ({
      date,
      avgDelay: count > 0 ? Math.round(totalDelay / count) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate 7-day rolling average
  return sortedDays.map((day, index) => {
    const windowStart = Math.max(0, index - 6);
    const window = sortedDays.slice(windowStart, index + 1);
    const rollingAvg =
      window.length > 0
        ? Math.round(
            window.reduce((sum, item) => sum + item.avgDelay, 0) /
              window.length,
          )
        : 0;

    // Format date for display (e.g., "Jan 15")
    const dateObj = new Date(day.date);
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    return {
      date: formattedDate,
      avgDelay: day.avgDelay,
      rollingAvg,
    };
  });
};

/**
 * Generate delay data grouped by day of week.
 */
const generateDelayByDayOfWeekData = (data: ProcessedFlightData[]) => {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayDelays: Record<number, { totalDelay: number; count: number }> = {};

  // Initialize all days
  for (let i = 0; i < 7; i++) {
    dayDelays[i] = { totalDelay: 0, count: 0 };
  }

  for (const item of data) {
    const arrivalTime = item.arrival.scheduledGateTime;
    if (!arrivalTime) {
      continue;
    }

    try {
      const date = new Date(arrivalTime);
      const dayOfWeek = date.getDay();

      dayDelays[dayOfWeek]!.count += 1;

      if (item.arrival.delayInSeconds !== undefined) {
        dayDelays[dayOfWeek]!.totalDelay += Math.max(
          0,
          item.arrival.delayInSeconds / 60,
        );
      }
    } catch {
      // Ignore invalid dates
    }
  }

  return dayNames.map((name, index) => ({
    day: name,
    avgDelay:
      dayDelays[index]!.count > 0
        ? Math.round(dayDelays[index]!.totalDelay / dayDelays[index]!.count)
        : 0,
    flights: dayDelays[index]!.count,
  }));
};

/**
 * Generate average delay by hour of day.
 */
const generateDelayByHourData = (data: ProcessedFlightData[]) => {
  const hourDelays: Record<number, { totalDelay: number; count: number }> = {};

  // Initialize all hours
  for (let i = 0; i < 24; i++) {
    hourDelays[i] = { totalDelay: 0, count: 0 };
  }

  for (const item of data) {
    const arrivalTime = item.arrival.scheduledGateTime;
    if (!arrivalTime) {
      continue;
    }

    try {
      const date = new Date(arrivalTime);
      const hour = date.getUTCHours();

      hourDelays[hour]!.count += 1;

      if (item.arrival.delayInSeconds !== undefined) {
        hourDelays[hour]!.totalDelay += Math.max(
          0,
          item.arrival.delayInSeconds / 60,
        );
      }
    } catch {
      // Ignore invalid dates
    }
  }

  return Array.from({ length: 24 }, (_, hour) => ({
    hour: `${hour.toString().padStart(2, "0")}:00`,
    avgDelay:
      hourDelays[hour]!.count > 0
        ? Math.round(hourDelays[hour]!.totalDelay / hourDelays[hour]!.count)
        : 0,
    flights: hourDelays[hour]!.count,
  }));
};

/**
 * Generate bar data for average delay per flight by airline (sorted by worst first).
 */
const generateAirlinePerformanceData = (data: ProcessedFlightData[]) => {
  const airlineStats: Record<
    string,
    { totalDelayMinutes: number; flights: number }
  > = {};

  for (const item of data) {
    // Use full airline name, falling back to IATA code
    const airline = item.airline.name || item.airline.iataCode || "Unknown";

    airlineStats[airline] ??= {
      totalDelayMinutes: 0,
      flights: 0,
    };
    airlineStats[airline].flights += 1;

    if (item.arrival.delayInSeconds !== undefined) {
      airlineStats[airline].totalDelayMinutes += Math.max(
        0,
        Math.round(item.arrival.delayInSeconds / 60),
      );
    }
  }

  return Object.entries(airlineStats)
    .filter(([_, stats]) => stats.flights >= 10) // Only include airlines with enough data
    .map(([airline, stats]) => ({
      airline,
      avgDelay: Math.round(stats.totalDelayMinutes / stats.flights),
      flights: stats.flights,
    }))
    .sort((a, b) => b.avgDelay - a.avgDelay)
    .slice(0, 10); // Top 10 airlines by average delay
};

/**
 * Generate bar data for average delay per flight by route (sorted by worst first).
 */
const generateRoutePerformanceData = (data: ProcessedFlightData[]) => {
  const routeStats: Record<
    string,
    { totalDelayMinutes: number; flights: number }
  > = {};

  for (const item of data) {
    // Use city names for more readable route labels
    const origin =
      item.departureAirport.city ||
      item.departureAirport.name ||
      item.departureAirport.iataCode;
    const destination =
      item.arrivalAirport.city ||
      item.arrivalAirport.name ||
      item.arrivalAirport.iataCode;
    const route = `${origin}→${destination}`;

    routeStats[route] ??= {
      totalDelayMinutes: 0,
      flights: 0,
    };
    routeStats[route].flights += 1;

    if (item.arrival.delayInSeconds !== undefined) {
      routeStats[route].totalDelayMinutes += Math.max(
        0,
        Math.round(item.arrival.delayInSeconds / 60),
      );
    }
  }

  return Object.entries(routeStats)
    .filter(([_, stats]) => stats.flights >= 10) // Only include routes with enough data
    .map(([route, stats]) => ({
      route,
      avgDelay: Math.round(stats.totalDelayMinutes / stats.flights),
      flights: stats.flights,
    }))
    .sort((a, b) => b.avgDelay - a.avgDelay)
    .slice(0, 10); // Top 10 routes by average delay
};

/**
 * Get date range string for chart titles.
 */
const getDateRangeString = (data: ProcessedFlightData[]): string => {
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const item of data) {
    const arrivalTime = item.arrival.scheduledGateTime;
    if (!arrivalTime) {
      continue;
    }
    const date = arrivalTime.split("T")[0];
    if (!date) {
      continue;
    }
    if (!minDate || date < minDate) {
      minDate = date;
    }
    if (!maxDate || date > maxDate) {
      maxDate = date;
    }
  }

  if (!minDate || !maxDate) {
    return "";
  }

  const formatDate = (dateStr: string) => {
    const dateObj = new Date(dateStr);
    return dateObj.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  };

  return `${formatDate(minDate)} - ${formatDate(maxDate)}`;
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
 * Get the date string (YYYY-MM-DD) from an ISO timestamp.
 */
const getDateString = (isoString?: string): string | null => {
  if (!isoString) {
    return null;
  }
  try {
    return new Date(isoString).toISOString().split("T")[0] ?? null;
  } catch {
    return null;
  }
};

/**
 * Find the most recent date in the flight data based on arrival times.
 */
const findMostRecentDate = (data: ProcessedFlightData[]): string | null => {
  let latestDate: string | null = null;

  for (const item of data) {
    const date = getDateString(item.arrival.scheduledGateTime);
    if (date && (!latestDate || date > latestDate)) {
      latestDate = date;
    }
  }

  return latestDate;
};

/**
 * Generate arrivals board data for the classic airport display.
 * Shows only flights from the most recent date in the data.
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

  // Filter to only show flights from the most recent date
  const mostRecentDate = findMostRecentDate(data);
  const filteredData = mostRecentDate
    ? data.filter(
        (item) =>
          getDateString(item.arrival.scheduledGateTime) === mostRecentDate,
      )
    : data;

  // Sort by scheduled arrival time chronologically
  const sortedData = [...filteredData].sort((a, b) => {
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
export const generateDashboardItems = (
  flightData: FlightWithLinksResolved[],
): DashboardItemData[] => {
  const processedData = processFlightData(flightData);
  const items: DashboardItemData[] = [];

  // 1. Arrivals Board (Custom Component) - Top, full width, prominent
  const arrivalsBoardData = generateArrivalsBoardData(processedData);
  const mostRecentDate = findMostRecentDate(processedData);
  const formattedDate = mostRecentDate
    ? new Date(mostRecentDate).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
  items.push(
    createCustomDashboardItem(
      "arrivals-board",
      `Arrivals - Gatwick Airport (LGW)${formattedDate ? ` - ${formattedDate}` : ""}`,
      "flight-board",
      arrivalsBoardData,
      { x: 0, y: 0, w: 12, h: 8 },
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
        { x: 0, y: 7, w: 12, h: 12 },
      ),
    );
  }

  // Get date range for chart titles
  const dateRangeStr = getDateRangeString(processedData);
  const dateRangeSuffix = dateRangeStr ? ` (${dateRangeStr})` : "";

  // 3. Delay Trend (Line Chart with Rolling Average) - Third row, full width
  const delayTrendData = generateDailyDelayTrendData(processedData);
  items.push(
    createDashboardItem(
      "delay-trend",
      `Daily Average Delay Trend${dateRangeSuffix}`,
      "line",
      delayTrendData,
      {
        categoryKey: "date",
        series: [
          {
            type: "line",
            dataKey: "avgDelay",
            name: "Daily Avg Delay",
            color: "#ef4444",
            smooth: false,
          },
          {
            type: "line",
            dataKey: "rollingAvg",
            name: "7-Day Rolling Avg",
            color: "#3b82f6",
            smooth: true,
          },
        ],
        xAxisLabel: "Date",
        yAxisLabel: "Average Delay (min)",
        showLegend: true,
        showTooltip: true,
        showGrid: true,
      },
      { x: 0, y: 15, w: 12, h: 6 },
    ),
  );

  // 4. Delay by Day of Week (Bar Chart) - Fourth row left
  const dayOfWeekData = generateDelayByDayOfWeekData(processedData);
  items.push(
    createDashboardItem(
      "delay-by-day",
      `Avg Delay by Day of Week${dateRangeSuffix}`,
      "bar",
      dayOfWeekData,
      {
        categoryKey: "day",
        series: [
          {
            type: "bar",
            dataKey: "avgDelay",
            name: "Avg Delay (min)",
            color: "#f59e0b",
          },
        ],
        showLegend: false,
        showTooltip: true,
        showGrid: true,
      },
      { x: 0, y: 21, w: 6, h: 6 },
    ),
  );

  // 5. Average Delay by Hour (Line Chart) - Fourth row right
  const hourlyDelayData = generateDelayByHourData(processedData);
  items.push(
    createDashboardItem(
      "delay-by-hour",
      `Avg Delay by Hour (UTC)${dateRangeSuffix}`,
      "line",
      hourlyDelayData,
      {
        categoryKey: "hour",
        series: [
          {
            type: "line",
            dataKey: "avgDelay",
            name: "Avg Delay (min)",
            color: "#8b5cf6",
            smooth: true,
            areaStyle: { opacity: 0.2 },
          },
        ],
        showLegend: false,
        showTooltip: true,
        showGrid: true,
      },
      { x: 6, y: 21, w: 6, h: 6 },
    ),
  );

  // 6. Airline Delays - Average delay per flight by airline (worst first)
  const airlinePerformanceData = generateAirlinePerformanceData(processedData);
  items.push(
    createDashboardItem(
      "airline-delays",
      `Avg Delay per Flight by Airline${dateRangeSuffix}`,
      "bar",
      airlinePerformanceData,
      {
        categoryKey: "airline",
        series: [
          {
            type: "bar",
            dataKey: "avgDelay",
            name: "Avg Delay (min)",
            color: "#ef4444",
          },
        ],
        showLegend: false,
        showTooltip: true,
        showGrid: true,
      },
      { x: 0, y: 27, w: 6, h: 6 },
    ),
  );

  // 7. Route Delays - Average delay per flight by route (worst first)
  const routePerformanceData = generateRoutePerformanceData(processedData);
  items.push(
    createDashboardItem(
      "route-delays",
      `Avg Delay per Flight by Route${dateRangeSuffix}`,
      "bar",
      routePerformanceData,
      {
        categoryKey: "route",
        series: [
          {
            type: "bar",
            dataKey: "avgDelay",
            name: "Avg Delay (min)",
            color: "#ef4444",
          },
        ],
        showLegend: false,
        showTooltip: true,
        showGrid: true,
      },
      { x: 6, y: 27, w: 6, h: 6 },
    ),
  );

  return items;
};

/**
 * Generate schedule table data for use outside charts.
 * This can be used with a table component if needed.
 */
export const getScheduleTableData = (flightData: FlightWithLinksResolved[]) => {
  const processedData = processFlightData(flightData);
  return generateScheduleTableData(processedData);
};

/**
 * Get summary statistics for the flight data.
 */
export const getFlightSummary = (flightData: FlightWithLinksResolved[]) => {
  const processedData = processFlightData(flightData);

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
