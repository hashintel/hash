# Agent 1: Dashboard Entity Types

> **📋 Overview**: See [dashboard-overview.md](dashboard-overview.md) for the full feature context, architecture diagrams, and how this work stream relates to others.

## Mission

Create the `Dashboard` and `DashboardItem` entity types in HASH's type system, and generate the corresponding TypeScript types.

## Prerequisites

- Understanding of HASH's migration system
- Familiarity with entity type definitions

## Files to Create/Modify

### 1. New Migration File

Create: `apps/hash-api/src/graph/ensure-system-graph-is-initialized/migrate-ontology-types/migrations/XXX-create-dashboard-types.migration.ts`

(Replace XXX with the next available migration number - check existing files)

### 2. Ontology Type IDs

Modify: `libs/@local/hash-isomorphic-utils/src/ontology-type-ids.ts`

### 3. Shared Types (Create First)

Create: `libs/@local/hash-isomorphic-utils/src/dashboard-types.ts`

---

## Detailed Implementation

### Step 1: Create Shared Types File

Create `libs/@local/hash-isomorphic-utils/src/dashboard-types.ts`:

```typescript
/**
 * Shared types for the Dashboard feature.
 * Used by frontend, API, and AI worker.
 */

import type { EntityId, WebId, VersionedUrl } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";

/**
 * React Grid Layout position for a dashboard item
 */
export type GridPosition = {
  i: string;  // Unique identifier (usually entityId)
  x: number;  // X position in grid units
  y: number;  // Y position in grid units
  w: number;  // Width in grid units
  h: number;  // Height in grid units
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  static?: boolean;
};

/**
 * React Grid Layout configuration for responsive breakpoints
 */
export type DashboardGridLayout = {
  layouts: {
    lg?: GridPosition[];
    md?: GridPosition[];
    sm?: GridPosition[];
    xs?: GridPosition[];
  };
  breakpoints?: {
    lg: number;
    md: number;
    sm: number;
    xs: number;
  };
  cols?: {
    lg: number;
    md: number;
    sm: number;
    xs: number;
  };
};

/**
 * Supported chart types (aligned with Recharts)
 */
export type ChartType =
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "scatter"
  | "radar"
  | "composed";

/**
 * Chart configuration (Recharts-compatible props)
 */
export type ChartConfig = {
  // Axis configuration
  xAxisKey?: string;
  yAxisKey?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;

  // Data keys for multi-series charts
  dataKeys?: string[];

  // Visual configuration
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;

  // Chart-specific options
  stacked?: boolean;           // For bar/area charts
  innerRadius?: number;        // For pie charts
  outerRadius?: number;        // For pie charts

  // Dimensions (optional, usually responsive)
  width?: number;
  height?: number;
};

/**
 * Configuration stored on a DashboardItem entity
 */
export type DashboardItemConfig = {
  /** The user's natural language goal for this chart */
  userGoal: string;

  /** Generated Graph API filter query */
  structuredQuery: Filter | null;

  /** Python script for data transformation */
  pythonScript: string | null;

  /** Transformed data ready for charting */
  chartData: unknown[] | null;

  /** Type of chart to render */
  chartType: ChartType;

  /** Recharts configuration props */
  chartConfig: ChartConfig;

  /** Grid position within the dashboard */
  gridPosition: GridPosition;

  /** Status of LLM configuration */
  configurationStatus: "pending" | "configuring" | "ready" | "error";

  /** Error message if configuration failed */
  errorMessage?: string;
};

/**
 * Input for the generate-dashboard-query activity
 */
export type GenerateDashboardQueryInput = {
  userGoal: string;
  webId: WebId;
  availableEntityTypes?: VersionedUrl[];
};

/**
 * Output from the generate-dashboard-query activity
 */
export type GenerateDashboardQueryOutput = {
  structuredQuery: Filter;
  explanation: string;
  sampleData?: unknown[];
  suggestedChartTypes?: ChartType[];
};

/**
 * Input for the analyze-dashboard-data activity
 */
export type AnalyzeDashboardDataInput = {
  structuredQuery: Filter;
  userGoal: string;
  targetChartType?: ChartType;
  webId: WebId;
};

/**
 * Output from the analyze-dashboard-data activity
 */
export type AnalyzeDashboardDataOutput = {
  pythonScript: string;
  chartData: unknown[];
  suggestedChartType: ChartType;
  explanation: string;
};

/**
 * Input for the generate-chart-config activity
 */
export type GenerateChartConfigInput = {
  chartData: unknown[];
  chartType: ChartType;
  userGoal: string;
};

/**
 * Output from the generate-chart-config activity
 */
export type GenerateChartConfigOutput = {
  chartConfig: ChartConfig;
  explanation: string;
};
```

### Step 2: Create Migration File

Reference existing migrations like `001-create-hash-system-types.migration.ts` for patterns.

Create `apps/hash-api/src/graph/ensure-system-graph-is-initialized/migrate-ontology-types/migrations/XXX-create-dashboard-types.migration.ts`:

```typescript
import type { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  createSystemLinkEntityTypeIfNotExists,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  // ============================================
  // Property Types
  // ============================================

  const gridLayoutPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Grid Layout",
        description:
          "Configuration for a React Grid Layout, including positions and breakpoints.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const userGoalPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "User Goal",
        description:
          "A natural language description of what the user wants to achieve.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const structuredQueryPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Structured Query",
        description: "A Graph API filter query in JSON format.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const pythonScriptPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Python Script",
        description: "Python code for data transformation and analysis.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const chartConfigPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Chart Configuration",
        description: "Configuration options for rendering a chart.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const chartTypePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Chart Type",
        description:
          "The type of chart to render (bar, line, pie, area, scatter, radar, composed).",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const gridPositionPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Grid Position",
        description:
          "Position and size of an item within a grid layout (x, y, w, h).",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const configurationStatusPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Configuration Status",
        description:
          "Status of LLM-based configuration (pending, configuring, ready, error).",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    });

  // ============================================
  // Entity Types
  // ============================================

  // Get existing property types we'll reuse
  // (title, description are likely already defined - check ontology-type-ids.ts)

  const dashboardItemEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Dashboard Item",
        description:
          "A single visualization item within a dashboard, containing query, analysis script, and chart configuration.",
        properties: [
          {
            propertyType: "https://blockprotocol.org/@blockprotocol/types/property-type/name/",
            required: true,
          },
          {
            propertyType: userGoalPropertyType,
            required: true,
          },
          {
            propertyType: structuredQueryPropertyType,
            required: false,
          },
          {
            propertyType: pythonScriptPropertyType,
            required: false,
          },
          {
            propertyType: chartConfigPropertyType,
            required: false,
          },
          {
            propertyType: chartTypePropertyType,
            required: false,
          },
          {
            propertyType: gridPositionPropertyType,
            required: true,
          },
          {
            propertyType: configurationStatusPropertyType,
            required: true,
          },
        ],
        outgoingLinks: [],
      },
      webShortname: "h",
      migrationState,
    },
  );

  // Create the "Has Dashboard Item" link type
  const hasDashboardItemLinkType = await createSystemLinkEntityTypeIfNotExists(
    context,
    authentication,
    {
      linkEntityTypeDefinition: {
        title: "Has Dashboard Item",
        description: "Links a Dashboard to its Dashboard Items.",
        destinationEntityTypes: [dashboardItemEntityType],
      },
      webShortname: "h",
      migrationState,
    },
  );

  // Create the Dashboard entity type
  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Dashboard",
      description:
        "A customizable dashboard containing multiple visualization items arranged in a grid layout.",
      properties: [
        {
          propertyType: "https://blockprotocol.org/@blockprotocol/types/property-type/name/",
          required: true,
        },
        {
          propertyType: "https://blockprotocol.org/@blockprotocol/types/property-type/description/",
          required: false,
        },
        {
          propertyType: gridLayoutPropertyType,
          required: false,
        },
      ],
      outgoingLinks: [
        {
          linkEntityType: hasDashboardItemLinkType,
          minItems: 0,
        },
      ],
    },
    webShortname: "h",
    migrationState,
  });
};

export default migrate;
```

### Step 3: Add to Ontology Type IDs

Add to `libs/@local/hash-isomorphic-utils/src/ontology-type-ids.ts`:

```typescript
// In systemEntityTypes object:
dashboard: {
  entityTypeId: "https://hash.ai/@h/types/entity-type/dashboard/v/1",
  entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/dashboard/" as BaseUrl,
},
dashboardItem: {
  entityTypeId: "https://hash.ai/@h/types/entity-type/dashboard-item/v/1",
  entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/dashboard-item/" as BaseUrl,
},

// In systemLinkEntityTypes object:
hasDashboardItem: {
  linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-dashboard-item/v/1",
  linkEntityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/has-dashboard-item/" as BaseUrl,
},

// In systemPropertyTypes object:
gridLayout: {
  propertyTypeId: "https://hash.ai/@h/types/property-type/grid-layout/v/1",
  propertyTypeBaseUrl: "https://hash.ai/@h/types/property-type/grid-layout/" as BaseUrl,
},
userGoal: {
  propertyTypeId: "https://hash.ai/@h/types/property-type/user-goal/v/1",
  propertyTypeBaseUrl: "https://hash.ai/@h/types/property-type/user-goal/" as BaseUrl,
},
structuredQuery: {
  propertyTypeId: "https://hash.ai/@h/types/property-type/structured-query/v/1",
  propertyTypeBaseUrl: "https://hash.ai/@h/types/property-type/structured-query/" as BaseUrl,
},
pythonScript: {
  propertyTypeId: "https://hash.ai/@h/types/property-type/python-script/v/1",
  propertyTypeBaseUrl: "https://hash.ai/@h/types/property-type/python-script/" as BaseUrl,
},
chartConfig: {
  propertyTypeId: "https://hash.ai/@h/types/property-type/chart-configuration/v/1",
  propertyTypeBaseUrl: "https://hash.ai/@h/types/property-type/chart-configuration/" as BaseUrl,
},
chartType: {
  propertyTypeId: "https://hash.ai/@h/types/property-type/chart-type/v/1",
  propertyTypeBaseUrl: "https://hash.ai/@h/types/property-type/chart-type/" as BaseUrl,
},
gridPosition: {
  propertyTypeId: "https://hash.ai/@h/types/property-type/grid-position/v/1",
  propertyTypeBaseUrl: "https://hash.ai/@h/types/property-type/grid-position/" as BaseUrl,
},
configurationStatus: {
  propertyTypeId: "https://hash.ai/@h/types/property-type/configuration-status/v/1",
  propertyTypeBaseUrl: "https://hash.ai/@h/types/property-type/configuration-status/" as BaseUrl,
},
```

### Step 4: Generate TypeScript Types

After the migration runs, system types are auto-generated. However, you can create stub types manually for other agents to use immediately.

Create `libs/@local/hash-isomorphic-utils/src/system-types/dashboard.ts`:

```typescript
/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity, ObjectMetadata } from "@blockprotocol/type-system";

import type {
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
} from "./shared.js";

// Dashboard Item

export type DashboardItem = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/dashboard-item/v/1"];
  properties: DashboardItemProperties;
  propertiesWithMetadata: DashboardItemPropertiesWithMetadata;
};

export type DashboardItemProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/user-goal/": TextDataType;
  "https://hash.ai/@h/types/property-type/structured-query/"?: ObjectDataType;
  "https://hash.ai/@h/types/property-type/python-script/"?: TextDataType;
  "https://hash.ai/@h/types/property-type/chart-configuration/"?: ObjectDataType;
  "https://hash.ai/@h/types/property-type/chart-type/"?: TextDataType;
  "https://hash.ai/@h/types/property-type/grid-position/": ObjectDataType;
  "https://hash.ai/@h/types/property-type/configuration-status/": TextDataType;
};

export type DashboardItemPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/user-goal/": TextDataTypeWithMetadata;
    "https://hash.ai/@h/types/property-type/structured-query/"?: ObjectDataTypeWithMetadata;
    "https://hash.ai/@h/types/property-type/python-script/"?: TextDataTypeWithMetadata;
    "https://hash.ai/@h/types/property-type/chart-configuration/"?: ObjectDataTypeWithMetadata;
    "https://hash.ai/@h/types/property-type/chart-type/"?: TextDataTypeWithMetadata;
    "https://hash.ai/@h/types/property-type/grid-position/": ObjectDataTypeWithMetadata;
    "https://hash.ai/@h/types/property-type/configuration-status/": TextDataTypeWithMetadata;
  };
};

// Dashboard

export type Dashboard = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/dashboard/v/1"];
  properties: DashboardProperties;
  propertiesWithMetadata: DashboardPropertiesWithMetadata;
};

export type DashboardProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://hash.ai/@h/types/property-type/grid-layout/"?: ObjectDataType;
};

export type DashboardPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/grid-layout/"?: ObjectDataTypeWithMetadata;
  };
};

// Has Dashboard Item Link

export type HasDashboardItem = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/has-dashboard-item/v/1"];
  properties: HasDashboardItemProperties;
  propertiesWithMetadata: HasDashboardItemPropertiesWithMetadata;
};

export type HasDashboardItemProperties = Record<string, never>;
export type HasDashboardItemPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: Record<string, never>;
};

export type DashboardHasDashboardItemLink = {
  linkEntity: HasDashboardItem;
  rightEntity: Entity<DashboardItem>;
};

export type DashboardOutgoingLinkAndTarget = DashboardHasDashboardItemLink;

export type DashboardOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-dashboard-item/v/1": DashboardHasDashboardItemLink;
};
```

---

## Completion Criteria

- [ ] Shared types file created at `libs/@local/hash-isomorphic-utils/src/dashboard-types.ts`
- [ ] Migration file created and follows existing patterns
- [ ] Types added to `ontology-type-ids.ts`
- [ ] TypeScript entity types created in `system-types/dashboard.ts`
- [ ] Code compiles without errors: `yarn lint:tsc`
- [ ] Export added to `libs/@local/hash-isomorphic-utils/src/system-types/index.ts` (if it exists)

## Interface for Other Agents

Other agents can import:

```typescript
import type {
  DashboardGridLayout,
  DashboardItemConfig,
  ChartType,
  ChartConfig,
  GenerateDashboardQueryInput,
  GenerateDashboardQueryOutput,
  // ... etc
} from "@local/hash-isomorphic-utils/dashboard-types";

import type {
  Dashboard,
  DashboardItem,
  HasDashboardItem,
} from "@local/hash-isomorphic-utils/system-types/dashboard";
```

## Notes

- Check existing property types before creating new ones - `name` and `description` likely already exist
- The migration number (XXX) should be determined by looking at existing migration files
- Property type base URLs follow the pattern: `https://hash.ai/@h/types/property-type/{kebab-case-name}/`
- Entity type base URLs follow the pattern: `https://hash.ai/@h/types/entity-type/{kebab-case-name}/`
