/**
 * Data script bodies and dummy dashboard item configs.
 * Scripts run with: data (vertices), params, processVerticesIntoFlights, processFlightData in scope.
 */
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";

import type { DataScript } from "../shared/types";

export type DummyItemConfig = {
  id: string;
  title: string;
  chartType: ChartType | "flight-board" | "world-map";
  chartConfig: ChartConfig | null;
  dataScript: DataScript;
  gridPosition: { x: number; y: number; w: number; h: number };
};

const DATE_RANGE_OPTIONS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

/** Filter processed array to last N days based on params.dateRange */
const filterByDateRange = `
function filterByDateRange(processed, params) {
  var range = params && params.dateRange;
  if (!range || range === '90d') return processed;
  var days = range === '7d' ? 7 : 30;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  var cutoffStr = cutoff.toISOString().split('T')[0];
  return processed.filter(function(item) {
    var d = item.arrival.scheduledGateTime;
    if (!d) return false;
    var dateStr = new Date(d).toISOString().split('T')[0];
    return dateStr >= cutoffStr;
  });
}
`;

/** Arrivals board: show flights "around now" (past 2h + next 12h), exclude landed >1h ago. Uses params.now (ISO) if set. */
const scriptArrivalsBoard = `
var flights = processVerticesIntoFlights(data);
var processed = processFlightData(flights);
var now = (params && params.now) ? new Date(params.now) : new Date();
var nowMs = now.getTime();
var oneHoursMs = 1 * 60 * 60 * 1000;
var twelveHoursMs = 12 * 60 * 60 * 1000;
var windowStart = nowMs - oneHoursMs;
var windowEnd = nowMs + twelveHoursMs;
var oneHourMs = 60 * 60 * 1000;
function formatTime(iso) {
  if (!iso) return '--:--';
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch(e) { return '--:--'; }
}
function mapStatus(st, delay) {
  if (st === 'Landed') return 'Landed';
  if (st === 'Cancelled') return 'Cancelled';
  if (st === 'Scheduled' && delay && delay > 300) return 'Delayed';
  return 'On Time';
}
var filtered = processed.filter(function(it) {
  var sched = it.arrival.scheduledGateTime;
  if (!sched) return false;
  var schedMs = new Date(sched).getTime();
  if (schedMs < windowStart || schedMs > windowEnd) return false;
  if (it.flight.flightStatus === 'Landed') {
    var landedAt = it.arrival.actualGateTime || it.arrival.actualRunwayTime;
    if (landedAt && (nowMs - new Date(landedAt).getTime() > oneHourMs)) return false;
  }
  return true;
});
var sorted = filtered.slice().sort(function(a, b) {
  var tA = a.arrival.scheduledGateTime ? new Date(a.arrival.scheduledGateTime).getTime() : Infinity;
  var tB = b.arrival.scheduledGateTime ? new Date(b.arrival.scheduledGateTime).getTime() : Infinity;
  return tA - tB;
});
return sorted.map(function(it) {
  return {
    entityId: it.flight.entityId,
    flight: it.flight.flightNumber,
    origin: (it.departureAirport.city || it.departureAirport.name || '') + ' (' + it.departureAirport.iataCode + ')',
    scheduledTime: formatTime(it.arrival.scheduledGateTime),
    estimatedTime: formatTime(it.arrival.estimatedGateTime),
    gate: it.arrival.gate || '-',
    status: mapStatus(it.flight.flightStatus, it.arrival.delayInSeconds)
  };
});
`;

/** World map: flights with lat/lng and status for arrow color (on time / delayed) */
const scriptWorldMap = `
var flights = processVerticesIntoFlights(data);
var processed = processFlightData(flights);
function mapStatus(st, delay) {
  if (st === 'Landed') return 'Landed';
  if (st === 'Cancelled') return 'Cancelled';
  if (st === 'Scheduled' && delay && delay > 300) return 'Delayed';
  return 'On Time';
}
return processed.filter(function(it) {
  return it.flight.latitude != null && it.flight.longitude != null;
}).map(function(it) {
  return {
    entityId: it.flight.entityId,
    flight: it.flight.flightNumber,
    latitude: it.flight.latitude,
    longitude: it.flight.longitude,
    altitude: it.flight.altitude ?? null,
    heading: it.flight.direction ?? null,
    status: mapStatus(it.flight.flightStatus, it.arrival.delayInSeconds)
  };
});
`;

/** Daily delay trend with 7-day rolling average */
const scriptDelayTrend = `
var flights = processVerticesIntoFlights(data);
var processed = processFlightData(flights);
${filterByDateRange}
processed = filterByDateRange(processed, params);
var dailyDelays = {};
for (var i = 0; i < processed.length; i++) {
  var it = processed[i];
  var t = it.arrival.scheduledGateTime;
  if (!t) continue;
  try {
    var date = new Date(t).toISOString().split('T')[0];
    if (!date) continue;
    if (!dailyDelays[date]) dailyDelays[date] = { totalDelay: 0, count: 0 };
    dailyDelays[date].count++;
    if (it.arrival.delayInSeconds != null) dailyDelays[date].totalDelay += Math.max(0, it.arrival.delayInSeconds / 60);
  } catch(e) {}
}
var sortedDays = Object.keys(dailyDelays).sort().map(function(date) {
  var o = dailyDelays[date];
  return { date: date, avgDelay: o.count > 0 ? Math.round(o.totalDelay / o.count) : 0 };
});
return sortedDays.map(function(day, idx) {
  var start = Math.max(0, idx - 6);
  var window = sortedDays.slice(start, idx + 1);
  var rolling = window.length > 0 ? Math.round(window.reduce(function(s, x) { return s + x.avgDelay; }, 0) / window.length) : 0;
  var formatted = new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { date: formatted, avgDelay: day.avgDelay, rollingAvg: rolling };
});
`;

/** Delay by day of week */
const scriptDelayByDay = `
var flights = processVerticesIntoFlights(data);
var processed = processFlightData(flights);
${filterByDateRange}
processed = filterByDateRange(processed, params);
var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var dayDelays = {};
for (var d = 0; d < 7; d++) dayDelays[d] = { totalDelay: 0, count: 0 };
for (var i = 0; i < processed.length; i++) {
  var t = processed[i].arrival.scheduledGateTime;
  if (!t) continue;
  try {
    var day = new Date(t).getDay();
    dayDelays[day].count++;
    if (processed[i].arrival.delayInSeconds != null) dayDelays[day].totalDelay += Math.max(0, processed[i].arrival.delayInSeconds / 60);
  } catch(e) {}
}
return dayNames.map(function(name, idx) {
  var o = dayDelays[idx];
  return { day: name, avgDelay: o.count > 0 ? Math.round(o.totalDelay / o.count) : 0, flights: o.count };
});
`;

/** Delay by hour */
const scriptDelayByHour = `
var flights = processVerticesIntoFlights(data);
var processed = processFlightData(flights);
${filterByDateRange}
processed = filterByDateRange(processed, params);
var hourDelays = {};
for (var h = 0; h < 24; h++) hourDelays[h] = { totalDelay: 0, count: 0 };
for (var i = 0; i < processed.length; i++) {
  var t = processed[i].arrival.scheduledGateTime;
  if (!t) continue;
  try {
    var hour = new Date(t).getUTCHours();
    hourDelays[hour].count++;
    if (processed[i].arrival.delayInSeconds != null) hourDelays[hour].totalDelay += Math.max(0, processed[i].arrival.delayInSeconds / 60);
  } catch(e) {}
}
return Array.from({ length: 24 }, function(_, h) {
  var o = hourDelays[h];
  return { hour: (h < 10 ? '0' : '') + h + ':00', avgDelay: o.count > 0 ? Math.round(o.totalDelay / o.count) : 0, flights: o.count };
});
`;

/** Airline performance (avg delay, top 10). Includes entityId for click-through to airline entity. */
const scriptAirlineDelays = `
var flights = processVerticesIntoFlights(data);
var processed = processFlightData(flights);
${filterByDateRange}
processed = filterByDateRange(processed, params);
var stats = {};
for (var i = 0; i < processed.length; i++) {
  var it = processed[i];
  var name = it.airline.name || it.airline.iataCode || 'Unknown';
  if (!stats[name]) stats[name] = { total: 0, flights: 0, entityId: it.airline.entityId };
  stats[name].flights++;
  if (it.arrival.delayInSeconds != null) stats[name].total += Math.max(0, Math.round(it.arrival.delayInSeconds / 60));
}
return Object.keys(stats).filter(function(k) { return stats[k].flights >= 10; }).map(function(airline) {
  var s = stats[airline];
  return { airline: airline, avgDelay: Math.round(s.total / s.flights), flights: s.flights, entityId: s.entityId };
}).sort(function(a, b) { return b.avgDelay - a.avgDelay; }).slice(0, 10);
`;

/** Route performance (avg delay, top 10). Short axis labels (IATA→IATA), routeFullName for tooltip, entityId = latest flight. */
const scriptRouteDelays = `
var flights = processVerticesIntoFlights(data);
var processed = processFlightData(flights);
${filterByDateRange}
processed = filterByDateRange(processed, params);
var stats = {};
for (var i = 0; i < processed.length; i++) {
  var it = processed[i];
  var routeShort = (it.departureAirport.iataCode || '?') + '→' + (it.arrivalAirport.iataCode || '?');
  var originLong = it.departureAirport.city || it.departureAirport.name || it.departureAirport.iataCode;
  var destLong = it.arrivalAirport.city || it.arrivalAirport.name || it.arrivalAirport.iataCode;
  var routeFullName = originLong + '→' + destLong;
  var sched = it.arrival.scheduledGateTime ? new Date(it.arrival.scheduledGateTime).getTime() : 0;
  if (!stats[routeShort]) stats[routeShort] = { total: 0, flights: 0, routeFullName: routeFullName, latestFlight: null, latestSched: 0 };
  stats[routeShort].flights++;
  if (it.arrival.delayInSeconds != null) stats[routeShort].total += Math.max(0, Math.round(it.arrival.delayInSeconds / 60));
  if (sched >= (stats[routeShort].latestSched || 0)) {
    stats[routeShort].latestFlight = it.flight.entityId;
    stats[routeShort].latestSched = sched;
  }
}
return Object.keys(stats).filter(function(k) { return stats[k].flights >= 10; }).map(function(route) {
  var s = stats[route];
  return { route: route, routeFullName: s.routeFullName, avgDelay: Math.round(s.total / s.flights), flights: s.flights, entityId: s.latestFlight };
}).sort(function(a, b) { return b.avgDelay - a.avgDelay; }).slice(0, 10);
`;

const dateRangeParam = {
  default: "30d",
  options: DATE_RANGE_OPTIONS,
};

export const DUMMY_ITEM_CONFIGS: DummyItemConfig[] = [
  {
    id: "arrivals-board",
    title: "Arrivals - Gatwick Airport (LGW)",
    chartType: "flight-board",
    chartConfig: null,
    dataScript: { script: scriptArrivalsBoard },
    gridPosition: { x: 0, y: 0, w: 12, h: 8 },
  },
  {
    id: "flight-positions",
    title: "Live Flight Positions",
    chartType: "world-map",
    chartConfig: null,
    dataScript: { script: scriptWorldMap },
    gridPosition: { x: 0, y: 7, w: 12, h: 12 },
  },
  {
    id: "delay-trend",
    title: "Daily Average Delay Trend",
    chartType: "line",
    chartConfig: {
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
    dataScript: {
      script: scriptDelayTrend,
      parameters: { dateRange: dateRangeParam },
    },
    gridPosition: { x: 0, y: 15, w: 12, h: 6 },
  },
  {
    id: "delay-by-day",
    title: "Avg Delay by Day of Week",
    chartType: "bar",
    chartConfig: {
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
    dataScript: {
      script: scriptDelayByDay,
      parameters: { dateRange: dateRangeParam },
    },
    gridPosition: { x: 0, y: 21, w: 6, h: 6 },
  },
  {
    id: "delay-by-hour",
    title: "Avg Delay by Hour (UTC)",
    chartType: "line",
    chartConfig: {
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
    dataScript: {
      script: scriptDelayByHour,
      parameters: { dateRange: dateRangeParam },
    },
    gridPosition: { x: 6, y: 21, w: 6, h: 6 },
  },
  {
    id: "airline-delays",
    title: "Avg Delay per Flight by Airline",
    chartType: "bar",
    chartConfig: {
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
    dataScript: {
      script: scriptAirlineDelays,
      parameters: { dateRange: dateRangeParam },
    },
    gridPosition: { x: 0, y: 27, w: 6, h: 6 },
  },
  {
    id: "route-delays",
    title: "Avg Delay per Flight by Route",
    chartType: "bar",
    chartConfig: {
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
      tooltipLabelKey: "routeFullName",
    },
    dataScript: {
      script: scriptRouteDelays,
      parameters: { dateRange: dateRangeParam },
    },
    gridPosition: { x: 6, y: 27, w: 6, h: 6 },
  },
];
