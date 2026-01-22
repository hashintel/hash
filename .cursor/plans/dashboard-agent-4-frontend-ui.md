# Agent 4: Frontend Dashboard UI

> **📋 Overview**: See [dashboard-overview.md](dashboard-overview.md) for the full feature context, architecture diagrams, and how this work stream relates to others.

## Mission

Build the dashboard page with React Grid Layout for arranging items and Recharts for rendering visualizations.

## Prerequisites

- Understanding of React and MUI
- Familiarity with HASH's frontend patterns
- Knowledge of React Grid Layout and Recharts

## Reference Files

- Page patterns: `apps/hash-frontend/src/pages/flows.page.tsx`
- Layout: `apps/hash-frontend/src/shared/layout/`
- Entity visualization: `apps/hash-frontend/src/pages/@/[shortname]/shared/flow-visualizer/`
- Hooks: `apps/hash-frontend/src/components/hooks/`

## Dependencies to Install

First, install the required packages:

```bash
yarn workspace @apps/hash-frontend add react-grid-layout recharts @types/react-grid-layout
```

## Files to Create

```
apps/hash-frontend/src/pages/
├── dashboards.page.tsx                    # Dashboard list page
└── dashboard/
    └── [dashboardId].page.tsx             # Single dashboard view

apps/hash-frontend/src/pages/dashboard/
├── dashboard-grid.tsx                     # React Grid Layout wrapper
├── dashboard-item.tsx                     # Individual item container
├── chart-renderer.tsx                     # Recharts rendering
├── add-item-button.tsx                    # Button to add new items
├── dashboard-header.tsx                   # Title, description, actions
└── shared/
    ├── types.ts                           # Local types
    └── mock-data.ts                       # Mock data for development
```

---

## Detailed Implementation

### Step 1: Install Dependencies

```bash
cd apps/hash-frontend
yarn add react-grid-layout recharts @types/react-grid-layout
```

### Step 2: Create Shared Types and Mock Data

Create `apps/hash-frontend/src/pages/dashboard/shared/types.ts`:

```typescript
import type { EntityId } from "@blockprotocol/type-system";
import type {
  ChartConfig,
  ChartType,
  DashboardGridLayout,
  GridPosition,
} from "@local/hash-isomorphic-utils/dashboard-types";

export type DashboardItemData = {
  entityId: EntityId;
  title: string;
  userGoal: string;
  chartType: ChartType | null;
  chartData: unknown[] | null;
  chartConfig: ChartConfig | null;
  gridPosition: GridPosition;
  configurationStatus: "pending" | "configuring" | "ready" | "error";
  errorMessage?: string;
};

export type DashboardData = {
  entityId: EntityId;
  title: string;
  description?: string;
  gridLayout: DashboardGridLayout | null;
  items: DashboardItemData[];
};
```

Create `apps/hash-frontend/src/pages/dashboard/shared/mock-data.ts`:

```typescript
import type { DashboardData, DashboardItemData } from "./types";

export const mockDashboardItem: DashboardItemData = {
  entityId: "mock-web~mock-entity-1" as any,
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
    xAxisKey: "name",
    yAxisKey: "value",
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
  entityId: "mock-web~mock-entity-2" as any,
  title: "Revenue by Month",
  userGoal: "Show monthly revenue trends",
  chartType: null,
  chartData: null,
  chartConfig: null,
  gridPosition: { i: "mock-entity-2", x: 6, y: 0, w: 6, h: 4 },
  configurationStatus: "configuring",
};

export const mockDashboardItemPending: DashboardItemData = {
  entityId: "mock-web~mock-entity-3" as any,
  title: "New Chart",
  userGoal: "",
  chartType: null,
  chartData: null,
  chartConfig: null,
  gridPosition: { i: "mock-entity-3", x: 0, y: 4, w: 4, h: 3 },
  configurationStatus: "pending",
};

export const mockDashboard: DashboardData = {
  entityId: "mock-web~mock-dashboard-1" as any,
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
  items: [mockDashboardItem, mockDashboardItemConfiguring, mockDashboardItemPending],
};

export const mockDashboardsList: DashboardData[] = [
  mockDashboard,
  {
    entityId: "mock-web~mock-dashboard-2" as any,
    title: "Sales Overview",
    description: "Key sales metrics and trends",
    gridLayout: null,
    items: [],
  },
];
```

### Step 3: Create Chart Renderer

Create `apps/hash-frontend/src/pages/dashboard/chart-renderer.tsx`:

```tsx
import type { ChartConfig, ChartType } from "@local/hash-isomorphic-utils/dashboard-types";
import { Box, Typography } from "@mui/material";
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

const DEFAULT_COLORS = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#0088fe",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
];

type ChartRendererProps = {
  chartType: ChartType;
  chartData: unknown[];
  chartConfig: ChartConfig;
};

export const ChartRenderer = ({
  chartType,
  chartData,
  chartConfig,
}: ChartRendererProps) => {
  const {
    xAxisKey = "name",
    yAxisKey = "value",
    xAxisLabel,
    yAxisLabel,
    dataKeys,
    colors = DEFAULT_COLORS,
    showLegend = true,
    showGrid = true,
    showTooltip = true,
    stacked = false,
    innerRadius = 0,
    outerRadius = 80,
  } = chartConfig;

  const effectiveDataKeys = useMemo(() => {
    if (dataKeys && dataKeys.length > 0) {
      return dataKeys;
    }
    // Infer data keys from first data item
    if (chartData.length > 0) {
      const firstItem = chartData[0] as Record<string, unknown>;
      return Object.keys(firstItem).filter(
        (key) => key !== xAxisKey && typeof firstItem[key] === "number",
      );
    }
    return [yAxisKey];
  }, [dataKeys, chartData, xAxisKey, yAxisKey]);

  const renderChart = () => {
    switch (chartType) {
      case "bar":
        return (
          <BarChart data={chartData as any[]}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xAxisKey} label={xAxisLabel ? { value: xAxisLabel, position: "bottom" } : undefined} />
            <YAxis label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: "left" } : undefined} />
            {showTooltip && <Tooltip />}
            {showLegend && effectiveDataKeys.length > 1 && <Legend />}
            {effectiveDataKeys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                fill={colors[index % colors.length]}
                stackId={stacked ? "stack" : undefined}
              />
            ))}
          </BarChart>
        );

      case "line":
        return (
          <LineChart data={chartData as any[]}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xAxisKey} />
            <YAxis />
            {showTooltip && <Tooltip />}
            {showLegend && effectiveDataKeys.length > 1 && <Legend />}
            {effectiveDataKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        );

      case "area":
        return (
          <AreaChart data={chartData as any[]}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xAxisKey} />
            <YAxis />
            {showTooltip && <Tooltip />}
            {showLegend && effectiveDataKeys.length > 1 && <Legend />}
            {effectiveDataKeys.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                fill={colors[index % colors.length]}
                stroke={colors[index % colors.length]}
                stackId={stacked ? "stack" : undefined}
              />
            ))}
          </AreaChart>
        );

      case "pie":
        return (
          <PieChart>
            <Pie
              data={chartData as any[]}
              dataKey={yAxisKey}
              nameKey={xAxisKey}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              label
            >
              {(chartData as any[]).map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            {showTooltip && <Tooltip />}
            {showLegend && <Legend />}
          </PieChart>
        );

      case "scatter":
        return (
          <ScatterChart>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xAxisKey} name={xAxisLabel} />
            <YAxis dataKey={yAxisKey} name={yAxisLabel} />
            {showTooltip && <Tooltip cursor={{ strokeDasharray: "3 3" }} />}
            <Scatter data={chartData as any[]} fill={colors[0]} />
          </ScatterChart>
        );

      case "radar":
        return (
          <RadarChart data={chartData as any[]}>
            <PolarGrid />
            <PolarAngleAxis dataKey={xAxisKey} />
            <PolarRadiusAxis />
            {effectiveDataKeys.map((key, index) => (
              <Radar
                key={key}
                dataKey={key}
                stroke={colors[index % colors.length]}
                fill={colors[index % colors.length]}
                fillOpacity={0.6}
              />
            ))}
            {showTooltip && <Tooltip />}
            {showLegend && effectiveDataKeys.length > 1 && <Legend />}
          </RadarChart>
        );

      default:
        return (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <Typography color="text.secondary">
              Unsupported chart type: {chartType}
            </Typography>
          </Box>
        );
    }
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      {renderChart()}
    </ResponsiveContainer>
  );
};
```

### Step 4: Create Dashboard Item Component

Create `apps/hash-frontend/src/pages/dashboard/dashboard-item.tsx`:

```tsx
import { Box, CircularProgress, IconButton, Paper, Typography } from "@mui/material";
import { Settings as SettingsIcon, Refresh as RefreshIcon } from "@mui/icons-material";

import { ChartRenderer } from "./chart-renderer";
import type { DashboardItemData } from "./shared/types";

type DashboardItemProps = {
  item: DashboardItemData;
  onConfigureClick?: () => void;
  onRefreshClick?: () => void;
};

export const DashboardItem = ({
  item,
  onConfigureClick,
  onRefreshClick,
}: DashboardItemProps) => {
  const { title, chartType, chartData, chartConfig, configurationStatus, errorMessage } = item;

  const renderContent = () => {
    switch (configurationStatus) {
      case "pending":
        return (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 2,
            }}
          >
            <Typography color="text.secondary">
              Click to configure this chart
            </Typography>
            <IconButton onClick={onConfigureClick} color="primary" size="large">
              <SettingsIcon />
            </IconButton>
          </Box>
        );

      case "configuring":
        return (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 2,
            }}
          >
            <CircularProgress />
            <Typography color="text.secondary">
              AI is configuring your chart...
            </Typography>
          </Box>
        );

      case "error":
        return (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 2,
              p: 2,
            }}
          >
            <Typography color="error" align="center">
              {errorMessage ?? "Failed to configure chart"}
            </Typography>
            <IconButton onClick={onConfigureClick} color="primary">
              <RefreshIcon />
            </IconButton>
          </Box>
        );

      case "ready":
        if (!chartType || !chartData || !chartConfig) {
          return (
            <Typography color="text.secondary" align="center">
              Missing chart configuration
            </Typography>
          );
        }
        return (
          <ChartRenderer
            chartType={chartType}
            chartData={chartData}
            chartConfig={chartConfig}
          />
        );
    }
  };

  return (
    <Paper
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      elevation={2}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 48,
        }}
      >
        <Typography variant="subtitle2" noWrap sx={{ flex: 1 }}>
          {title}
        </Typography>
        {configurationStatus === "ready" && (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <IconButton size="small" onClick={onRefreshClick}>
              <RefreshIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={onConfigureClick}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, p: 1, minHeight: 0 }}>
        {renderContent()}
      </Box>
    </Paper>
  );
};
```

### Step 5: Create Dashboard Grid

Create `apps/hash-frontend/src/pages/dashboard/dashboard-grid.tsx`:

```tsx
import { useCallback, useMemo } from "react";
import GridLayout, { WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { DashboardItem } from "./dashboard-item";
import type { DashboardData, DashboardItemData } from "./shared/types";

// Wrap GridLayout with WidthProvider for responsive behavior
const ResponsiveGridLayout = WidthProvider(GridLayout);

type DashboardGridProps = {
  dashboard: DashboardData;
  onLayoutChange?: (layout: GridLayout.Layout[]) => void;
  onItemConfigureClick?: (item: DashboardItemData) => void;
  onItemRefreshClick?: (item: DashboardItemData) => void;
  isEditing?: boolean;
};

export const DashboardGrid = ({
  dashboard,
  onLayoutChange,
  onItemConfigureClick,
  onItemRefreshClick,
  isEditing = true,
}: DashboardGridProps) => {
  const layout = useMemo(() => {
    return dashboard.items.map((item) => ({
      ...item.gridPosition,
      i: item.gridPosition.i || item.entityId,
    }));
  }, [dashboard.items]);

  const handleLayoutChange = useCallback(
    (newLayout: GridLayout.Layout[]) => {
      onLayoutChange?.(newLayout);
    },
    [onLayoutChange],
  );

  return (
    <ResponsiveGridLayout
      className="dashboard-grid"
      layout={layout}
      cols={12}
      rowHeight={100}
      onLayoutChange={handleLayoutChange}
      isDraggable={isEditing}
      isResizable={isEditing}
      draggableHandle=".drag-handle"
      margin={[16, 16]}
      containerPadding={[0, 0]}
    >
      {dashboard.items.map((item) => (
        <div key={item.gridPosition.i || item.entityId}>
          <DashboardItem
            item={item}
            onConfigureClick={() => onItemConfigureClick?.(item)}
            onRefreshClick={() => onItemRefreshClick?.(item)}
          />
        </div>
      ))}
    </ResponsiveGridLayout>
  );
};
```

### Step 6: Create Dashboard Header

Create `apps/hash-frontend/src/pages/dashboard/dashboard-header.tsx`:

```tsx
import {
  Box,
  IconButton,
  TextField,
  Typography,
  Button,
} from "@mui/material";
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import { useState } from "react";

type DashboardHeaderProps = {
  title: string;
  description?: string;
  isEditing: boolean;
  onEditToggle: () => void;
  onTitleChange?: (title: string) => void;
  onDescriptionChange?: (description: string) => void;
  onAddItem?: () => void;
};

export const DashboardHeader = ({
  title,
  description,
  isEditing,
  onEditToggle,
  onTitleChange,
  onDescriptionChange,
  onAddItem,
}: DashboardHeaderProps) => {
  const [editedTitle, setEditedTitle] = useState(title);
  const [editedDescription, setEditedDescription] = useState(description ?? "");

  const handleSave = () => {
    onTitleChange?.(editedTitle);
    onDescriptionChange?.(editedDescription);
    onEditToggle();
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        mb: 3,
        gap: 2,
      }}
    >
      <Box sx={{ flex: 1 }}>
        {isEditing ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <TextField
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              variant="outlined"
              size="small"
              placeholder="Dashboard title"
              sx={{ maxWidth: 400 }}
            />
            <TextField
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              variant="outlined"
              size="small"
              placeholder="Description (optional)"
              multiline
              rows={2}
              sx={{ maxWidth: 600 }}
            />
          </Box>
        ) : (
          <>
            <Typography variant="h4" component="h1">
              {title}
            </Typography>
            {description && (
              <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
                {description}
              </Typography>
            )}
          </>
        )}
      </Box>

      <Box sx={{ display: "flex", gap: 1 }}>
        {isEditing && (
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={onAddItem}
          >
            Add Chart
          </Button>
        )}
        <IconButton
          onClick={isEditing ? handleSave : onEditToggle}
          color={isEditing ? "primary" : "default"}
        >
          {isEditing ? <SaveIcon /> : <EditIcon />}
        </IconButton>
      </Box>
    </Box>
  );
};
```

### Step 7: Create Dashboard Page

Create `apps/hash-frontend/src/pages/dashboard/[dashboardId].page.tsx`:

```tsx
import { Box, Container } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import type { NextPageWithLayout } from "../../shared/layout";
import { getLayoutWithSidebar } from "../../shared/layout";

import { DashboardGrid } from "./dashboard-grid";
import { DashboardHeader } from "./dashboard-header";
import type { DashboardItemData } from "./shared/types";
import { mockDashboard } from "./shared/mock-data";

const DashboardPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { dashboardId } = router.query;

  // TODO: Replace with actual data fetching
  const [dashboard, setDashboard] = useState(mockDashboard);
  const [isEditing, setIsEditing] = useState(false);

  const handleLayoutChange = useCallback((newLayout: any[]) => {
    setDashboard((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const layoutItem = newLayout.find(
          (l) => l.i === (item.gridPosition.i || item.entityId),
        );
        if (layoutItem) {
          return {
            ...item,
            gridPosition: {
              i: layoutItem.i,
              x: layoutItem.x,
              y: layoutItem.y,
              w: layoutItem.w,
              h: layoutItem.h,
            },
          };
        }
        return item;
      }),
    }));
  }, []);

  const handleItemConfigureClick = useCallback((item: DashboardItemData) => {
    // TODO: Open configuration modal
    console.log("Configure item:", item);
  }, []);

  const handleItemRefreshClick = useCallback((item: DashboardItemData) => {
    // TODO: Trigger data refresh
    console.log("Refresh item:", item);
  }, []);

  const handleAddItem = useCallback(() => {
    // TODO: Open add item modal
    console.log("Add new item");
  }, []);

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <DashboardHeader
        title={dashboard.title}
        description={dashboard.description}
        isEditing={isEditing}
        onEditToggle={() => setIsEditing(!isEditing)}
        onAddItem={handleAddItem}
      />

      <Box sx={{ minHeight: "calc(100vh - 200px)" }}>
        <DashboardGrid
          dashboard={dashboard}
          onLayoutChange={handleLayoutChange}
          onItemConfigureClick={handleItemConfigureClick}
          onItemRefreshClick={handleItemRefreshClick}
          isEditing={isEditing}
        />
      </Box>
    </Container>
  );
};

DashboardPage.getLayout = (page) => getLayoutWithSidebar(page, {});

export default DashboardPage;
```

### Step 8: Create Dashboards List Page

Create `apps/hash-frontend/src/pages/dashboards.page.tsx`:

```tsx
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Container,
  Grid,
  Typography,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import { useRouter } from "next/router";
import { useState } from "react";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";

import { mockDashboardsList } from "./dashboard/shared/mock-data";

const DashboardsPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [dashboards] = useState(mockDashboardsList);

  const handleCreateDashboard = () => {
    // TODO: Open create dashboard modal or navigate to creation page
    console.log("Create new dashboard");
  };

  const handleDashboardClick = (dashboardId: string) => {
    router.push(`/dashboard/${dashboardId}`);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 4,
        }}
      >
        <Typography variant="h4" component="h1">
          Dashboards
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateDashboard}
        >
          New Dashboard
        </Button>
      </Box>

      <Grid container spacing={3}>
        {dashboards.map((dashboard) => (
          <Grid item xs={12} sm={6} md={4} key={dashboard.entityId}>
            <Card>
              <CardActionArea
                onClick={() => handleDashboardClick(dashboard.entityId)}
              >
                <CardContent sx={{ minHeight: 140 }}>
                  <Typography variant="h6" gutterBottom>
                    {dashboard.title}
                  </Typography>
                  {dashboard.description && (
                    <Typography variant="body2" color="text.secondary">
                      {dashboard.description}
                    </Typography>
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 2, display: "block" }}
                  >
                    {dashboard.items.length} chart
                    {dashboard.items.length !== 1 ? "s" : ""}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}

        {dashboards.length === 0 && (
          <Grid item xs={12}>
            <Box
              sx={{
                textAlign: "center",
                py: 8,
              }}
            >
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No dashboards yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Create your first dashboard to start visualizing your data
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreateDashboard}
              >
                Create Dashboard
              </Button>
            </Box>
          </Grid>
        )}
      </Grid>
    </Container>
  );
};

DashboardsPage.getLayout = (page) => getLayoutWithSidebar(page, {});

export default DashboardsPage;
```

### Step 9: Add CSS Import

You'll need to ensure the React Grid Layout CSS is loaded. Add this to `apps/hash-frontend/src/pages/_app.page.tsx` or create a separate CSS file:

```tsx
// In _app.page.tsx, add these imports:
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
```

Or create `apps/hash-frontend/src/pages/dashboard/dashboard.css`:

```css
.dashboard-grid {
  background-color: transparent;
}

.react-grid-item {
  transition: all 200ms ease;
  transition-property: left, top;
}

.react-grid-item.cssTransforms {
  transition-property: transform;
}

.react-grid-item.resizing {
  z-index: 1;
  will-change: width, height;
}

.react-grid-item.react-draggable-dragging {
  transition: none;
  z-index: 3;
  will-change: transform;
}

.react-grid-item > .react-resizable-handle {
  position: absolute;
  width: 20px;
  height: 20px;
}

.react-grid-item > .react-resizable-handle::after {
  content: "";
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 5px;
  height: 5px;
  border-right: 2px solid rgba(0, 0, 0, 0.4);
  border-bottom: 2px solid rgba(0, 0, 0, 0.4);
}
```

---

## Completion Criteria

- [ ] Dependencies installed: `react-grid-layout`, `recharts`, `@types/react-grid-layout`
- [ ] All component files created
- [ ] Mock data works for development
- [ ] Dashboard page renders with draggable/resizable items
- [ ] Charts render correctly with mock data
- [ ] `yarn lint:tsc` passes
- [ ] `yarn lint:eslint` passes (may need to fix any linting issues)

## Interface for Other Agents

This UI is designed to work with mock data initially. Agent 5 (LLM Config UI) will add:

- Configuration modal for items
- Real GraphQL data fetching
- Workflow status polling

Agent 3 (API Layer) will provide:

- GraphQL queries/mutations for data persistence
- Real entity data to replace mocks

## Testing

1. Navigate to `/dashboards` to see the list
2. Click a dashboard to view it
3. Drag and resize items (when in edit mode)
4. Verify charts render correctly

## Notes

- The `WidthProvider` HOC is created once outside the component to avoid re-creating on every render
- Grid layout uses a 12-column system by default
- Row height is set to 100px, adjust as needed
- Mock data includes items in different states (ready, configuring, pending) to test all UI states
