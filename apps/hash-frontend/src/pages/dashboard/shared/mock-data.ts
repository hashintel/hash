import type { EntityId } from "@blockprotocol/type-system";

import type { DashboardData, DashboardItemData } from "./types";

export const mockDashboardItem: DashboardItemData = {
  entityId: "mock-web~mock-entity-1" as EntityId,
  title: "Top Flights by Time",
  userGoal: "Show top 10 flights by scheduled departure time",
  chartType: "bar",
  chartData: [
    { name: "Flight AA123", value: 1200 },
    { name: "Flight UA456", value: 1150 },
    { name: "Flight DL789", value: 1100 },
    { name: "Flight SW012", value: 1050 },
    { name: "Flight BA345", value: 1000 },
  ],
  chartConfig: {
    categoryKey: "name",
    series: [{ type: "bar", name: "Scheduled Time", dataKey: "value" }],
    xAxisLabel: "Flight",
    yAxisLabel: "Scheduled Time",
    colors: ["#8884d8"],
    showLegend: false,
    showGrid: true,
    showTooltip: true,
  },
  gridPosition: { i: "mock-entity-1", x: 0, y: 0, w: 6, h: 4 },
  configurationStatus: "ready",
};

export const mockDashboardItemConfiguring: DashboardItemData = {
  entityId: "mock-web~mock-entity-2" as EntityId,
  title: "Revenue by Month",
  userGoal: "Show monthly revenue trends",
  chartType: null,
  chartData: null,
  chartConfig: null,
  gridPosition: { i: "mock-entity-2", x: 6, y: 0, w: 6, h: 4 },
  configurationStatus: "configuring",
};

export const mockDashboardItemPending: DashboardItemData = {
  entityId: "mock-web~mock-entity-3" as EntityId,
  title: "New Chart",
  userGoal: "",
  chartType: null,
  chartData: null,
  chartConfig: null,
  gridPosition: { i: "mock-entity-3", x: 0, y: 4, w: 4, h: 3 },
  configurationStatus: "pending",
};

export const mockDashboard: DashboardData = {
  entityId: "mock-web~mock-dashboard-1" as EntityId,
  title: "Flight Analytics Dashboard",
  description: "Overview of flight scheduling and performance metrics",
  gridLayout: {
    layouts: {
      lg: [
        { i: "mock-entity-1", x: 0, y: 0, w: 6, h: 4 },
        { i: "mock-entity-2", x: 6, y: 0, w: 6, h: 4 },
        { i: "mock-entity-3", x: 0, y: 4, w: 4, h: 3 },
      ],
    },
    breakpoints: { lg: 1200, md: 996, sm: 768, xs: 480 },
    cols: { lg: 12, md: 10, sm: 6, xs: 4 },
  },
  items: [
    mockDashboardItem,
    mockDashboardItemConfiguring,
    mockDashboardItemPending,
  ],
};

export const mockDashboardsList: DashboardData[] = [
  mockDashboard,
  {
    entityId: "mock-web~mock-dashboard-2" as EntityId,
    title: "Sales Overview",
    description: "Key sales metrics and trends",
    gridLayout: null,
    items: [],
  },
];
