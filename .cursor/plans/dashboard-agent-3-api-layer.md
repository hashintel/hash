# Agent 3: API Layer & GraphQL

> **📋 Overview**: See [dashboard-overview.md](dashboard-overview.md) for the full feature context, architecture diagrams, and how this work stream relates to others.

## Mission

Create GraphQL mutations and queries for dashboard CRUD operations and LLM workflow orchestration.

## Prerequisites

- Understanding of Apollo GraphQL
- Familiarity with HASH's resolver patterns
- Knowledge of Temporal workflow triggering

## Reference Files

- Resolver patterns: `apps/hash-api/src/graphql/resolvers/knowledge/entity/entity.ts`
- Flow resolvers: `apps/hash-api/src/graphql/resolvers/flows/`
- Service patterns: `apps/hash-api/src/graph/knowledge/system-types/flow-schedule.ts`
- GraphQL type definitions: `libs/@local/hash-isomorphic-utils/src/graphql/type-defs/`

## Files to Create/Modify

### Create

1. `apps/hash-api/src/graph/knowledge/system-types/dashboard.ts` - Service layer
2. `apps/hash-api/src/graphql/resolvers/knowledge/dashboard.ts` - GraphQL resolvers
3. `libs/@local/hash-isomorphic-utils/src/graphql/type-defs/knowledge/dashboard.typedef.ts` - Type definitions

### Modify

1. `apps/hash-api/src/graphql/resolvers/index.ts` - Register resolvers
2. `libs/@local/hash-isomorphic-utils/src/graphql/type-defs/knowledge/index.ts` - Export typedefs

---

## Detailed Implementation

### Step 1: Service Layer

Create `apps/hash-api/src/graph/knowledge/system-types/dashboard.ts`:

```typescript
import type { EntityId, WebId } from "@blockprotocol/type-system";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import type {
  DashboardGridLayout,
  DashboardItemConfig,
  ChartType,
  GridPosition,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { systemEntityTypes, systemLinkEntityTypes, systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { Dashboard, DashboardItem } from "@local/hash-isomorphic-utils/system-types/dashboard";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { createEntity, getLatestEntityById, updateEntityProperties, queryEntitySubgraph } from "../primitive/entity.js";
import { createLinkEntity } from "../primitive/link-entity.js";
import type { ImpureGraphContext, AuthenticationContext } from "../../context-types.js";
import { currentTimeInstantTemporalAxes, almostFullOntologyResolveDepths } from "@local/hash-isomorphic-utils/graph-queries";
import { getTemporalClient } from "../../../temporal.js";

export type CreateDashboardParams = {
  webId: WebId;
  title: string;
  description?: string;
};

export type UpdateDashboardLayoutParams = {
  dashboardEntityId: EntityId;
  gridLayout: DashboardGridLayout;
};

export type ConfigureDashboardItemParams = {
  dashboardEntityId: EntityId;
  userGoal: string;
  gridPosition: GridPosition;
};

export type UpdateDashboardItemParams = {
  itemEntityId: EntityId;
  structuredQuery?: object;
  pythonScript?: string;
  chartConfig?: object;
  chartType?: ChartType;
  configurationStatus?: string;
};

/**
 * Create a new Dashboard entity
 */
export const createDashboard = async (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  params: CreateDashboardParams,
): Promise<HashEntity<Dashboard>> => {
  const { webId, title, description } = params;

  const properties: Dashboard["properties"] = {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": title,
  };

  if (description) {
    properties["https://blockprotocol.org/@blockprotocol/types/property-type/description/"] = description;
  }

  const entity = await createEntity(context, authentication, {
    webId,
    entityTypeIds: [systemEntityTypes.dashboard.entityTypeId],
    properties,
  });

  return entity as HashEntity<Dashboard>;
};

/**
 * Get a Dashboard by entity ID
 */
export const getDashboard = async (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  params: { entityId: EntityId },
): Promise<HashEntity<Dashboard>> => {
  const entity = await getLatestEntityById(context, authentication, {
    entityId: params.entityId,
  });

  return entity as HashEntity<Dashboard>;
};

/**
 * Get all Dashboards for a web
 */
export const getDashboardsForWeb = async (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  params: { webId: WebId },
): Promise<HashEntity<Dashboard>[]> => {
  const { subgraph } = await queryEntitySubgraph(context, authentication, {
    filter: {
      all: [
        {
          equal: [
            { path: ["type", "baseUrl"] },
            { parameter: systemEntityTypes.dashboard.entityTypeBaseUrl },
          ],
        },
        {
          equal: [{ path: ["webId"] }, { parameter: params.webId }],
        },
        {
          equal: [{ path: ["archived"] }, { parameter: false }],
        },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    graphResolveDepths: {
      ...almostFullOntologyResolveDepths,
      hasLeftEntity: { incoming: 1, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 1 },
    },
    traversalPaths: [],
    includeDrafts: false,
    includePermissions: false,
  });

  // Extract dashboard entities from subgraph
  const dashboards = Object.values(subgraph.vertices)
    .flatMap((v) => Object.values(v))
    .filter(
      (v) =>
        v.kind === "entity" &&
        v.inner.metadata.entityTypeIds.includes(
          systemEntityTypes.dashboard.entityTypeId,
        ),
    )
    .map((v) => v.inner as HashEntity<Dashboard>);

  return dashboards;
};

/**
 * Update Dashboard grid layout
 */
export const updateDashboardLayout = async (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  params: UpdateDashboardLayoutParams,
): Promise<HashEntity<Dashboard>> => {
  const { dashboardEntityId, gridLayout } = params;

  const entity = await updateEntityProperties(context, authentication, {
    entityId: dashboardEntityId,
    properties: [
      {
        op: "replace",
        path: [systemPropertyTypes.gridLayout.propertyTypeBaseUrl],
        value: gridLayout,
      },
    ],
  });

  return entity as HashEntity<Dashboard>;
};

/**
 * Create a new Dashboard Item and link it to a Dashboard
 */
export const createDashboardItem = async (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  params: {
    dashboardEntityId: EntityId;
    title: string;
    userGoal: string;
    gridPosition: GridPosition;
  },
): Promise<HashEntity<DashboardItem>> => {
  const { dashboardEntityId, title, userGoal, gridPosition } = params;

  // Get the dashboard's webId
  const dashboard = await getDashboard(context, authentication, {
    entityId: dashboardEntityId,
  });
  const webId = dashboard.metadata.recordId.entityId.split("~")[0] as WebId;

  // Create the Dashboard Item entity
  const properties: DashboardItem["properties"] = {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": title,
    "https://hash.ai/@h/types/property-type/user-goal/": userGoal,
    "https://hash.ai/@h/types/property-type/grid-position/": gridPosition,
    "https://hash.ai/@h/types/property-type/configuration-status/": "pending",
  };

  const itemEntity = await createEntity(context, authentication, {
    webId,
    entityTypeIds: [systemEntityTypes.dashboardItem.entityTypeId],
    properties,
  });

  // Create link from Dashboard to Dashboard Item
  await createLinkEntity(context, authentication, {
    webId,
    linkEntityTypeId: systemLinkEntityTypes.hasDashboardItem.linkEntityTypeId,
    leftEntityId: dashboardEntityId,
    rightEntityId: itemEntity.metadata.recordId.entityId,
    properties: {},
  });

  return itemEntity as HashEntity<DashboardItem>;
};

/**
 * Update Dashboard Item properties
 */
export const updateDashboardItem = async (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  params: UpdateDashboardItemParams,
): Promise<HashEntity<DashboardItem>> => {
  const {
    itemEntityId,
    structuredQuery,
    pythonScript,
    chartConfig,
    chartType,
    configurationStatus,
  } = params;

  const operations: Array<{ op: string; path: string[]; value: unknown }> = [];

  if (structuredQuery !== undefined) {
    operations.push({
      op: "replace",
      path: [systemPropertyTypes.structuredQuery.propertyTypeBaseUrl],
      value: structuredQuery,
    });
  }

  if (pythonScript !== undefined) {
    operations.push({
      op: "replace",
      path: [systemPropertyTypes.pythonScript.propertyTypeBaseUrl],
      value: pythonScript,
    });
  }

  if (chartConfig !== undefined) {
    operations.push({
      op: "replace",
      path: [systemPropertyTypes.chartConfig.propertyTypeBaseUrl],
      value: chartConfig,
    });
  }

  if (chartType !== undefined) {
    operations.push({
      op: "replace",
      path: [systemPropertyTypes.chartType.propertyTypeBaseUrl],
      value: chartType,
    });
  }

  if (configurationStatus !== undefined) {
    operations.push({
      op: "replace",
      path: [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl],
      value: configurationStatus,
    });
  }

  const entity = await updateEntityProperties(context, authentication, {
    entityId: itemEntityId,
    properties: operations,
  });

  return entity as HashEntity<DashboardItem>;
};

/**
 * Get Dashboard Items for a Dashboard
 */
export const getDashboardItems = async (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  params: { dashboardEntityId: EntityId },
): Promise<HashEntity<DashboardItem>[]> => {
  const { subgraph } = await queryEntitySubgraph(context, authentication, {
    filter: {
      all: [
        {
          equal: [
            { path: ["leftEntity", "uuid"] },
            {
              parameter: params.dashboardEntityId.split("~")[1], // Extract UUID
            },
          ],
        },
        {
          equal: [
            { path: ["type", "baseUrl"] },
            {
              parameter:
                systemLinkEntityTypes.hasDashboardItem.linkEntityTypeBaseUrl,
            },
          ],
        },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    graphResolveDepths: {
      ...almostFullOntologyResolveDepths,
      hasLeftEntity: { incoming: 0, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 1 },
    },
    traversalPaths: [],
    includeDrafts: false,
    includePermissions: false,
  });

  // Extract dashboard item entities (right entities of the links)
  const items = Object.values(subgraph.vertices)
    .flatMap((v) => Object.values(v))
    .filter(
      (v) =>
        v.kind === "entity" &&
        v.inner.metadata.entityTypeIds.includes(
          systemEntityTypes.dashboardItem.entityTypeId,
        ),
    )
    .map((v) => v.inner as HashEntity<DashboardItem>);

  return items;
};

/**
 * Trigger LLM configuration workflow for a Dashboard Item
 */
export const triggerDashboardItemConfiguration = async (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  params: {
    itemEntityId: EntityId;
    webId: WebId;
  },
): Promise<{ workflowId: string }> => {
  const { itemEntityId, webId } = params;

  // Get the item to retrieve the user goal
  const item = await getLatestEntityById(context, authentication, {
    entityId: itemEntityId,
  }) as HashEntity<DashboardItem>;

  const userGoal =
    item.properties["https://hash.ai/@h/types/property-type/user-goal/"];

  // Update status to "configuring"
  await updateDashboardItem(context, authentication, {
    itemEntityId,
    configurationStatus: "configuring",
  });

  // Start Temporal workflow
  const temporalClient = await getTemporalClient();
  const workflowId = `dashboard-item-config-${generateUuid()}`;

  await temporalClient.workflow.start("configureDashboardItemWorkflow", {
    taskQueue: "ai",
    workflowId,
    args: [
      {
        itemEntityId,
        userGoal,
        webId,
        actorId: authentication.actorId,
      },
    ],
  });

  return { workflowId };
};
```

### Step 2: GraphQL Resolvers

Create `apps/hash-api/src/graphql/resolvers/knowledge/dashboard.ts`:

```typescript
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type {
  DashboardGridLayout,
  GridPosition,
} from "@local/hash-isomorphic-utils/dashboard-types";

import type { ResolverFn } from "../../api-types.gen.js";
import type { GraphQLContext } from "../../context.js";
import { graphQLContextToImpureGraphContext } from "../../context.js";
import {
  createDashboard,
  getDashboard,
  getDashboardsForWeb,
  updateDashboardLayout,
  createDashboardItem,
  updateDashboardItem,
  getDashboardItems,
  triggerDashboardItemConfiguration,
} from "../../../graph/knowledge/system-types/dashboard.js";

// Query Resolvers

export const getDashboardResolver: ResolverFn<
  unknown,
  Record<string, never>,
  GraphQLContext,
  { entityId: EntityId }
> = async (_, { entityId }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const dashboard = await getDashboard(context, graphQLContext.authentication, {
    entityId,
  });

  // Also fetch items
  const items = await getDashboardItems(context, graphQLContext.authentication, {
    dashboardEntityId: entityId,
  });

  return {
    entity: dashboard,
    items: items.map((item) => ({ entity: item })),
  };
};

export const getDashboardsResolver: ResolverFn<
  unknown,
  Record<string, never>,
  GraphQLContext,
  { webId: WebId }
> = async (_, { webId }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const dashboards = await getDashboardsForWeb(
    context,
    graphQLContext.authentication,
    { webId },
  );

  return dashboards.map((dashboard) => ({
    entity: dashboard,
  }));
};

// Mutation Resolvers

export const createDashboardResolver: ResolverFn<
  unknown,
  Record<string, never>,
  GraphQLContext,
  { webId: WebId; title: string; description?: string }
> = async (_, { webId, title, description }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const dashboard = await createDashboard(
    context,
    graphQLContext.authentication,
    { webId, title, description },
  );

  return { entity: dashboard, items: [] };
};

export const updateDashboardLayoutResolver: ResolverFn<
  unknown,
  Record<string, never>,
  GraphQLContext,
  { entityId: EntityId; gridLayout: DashboardGridLayout }
> = async (_, { entityId, gridLayout }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const dashboard = await updateDashboardLayout(
    context,
    graphQLContext.authentication,
    { dashboardEntityId: entityId, gridLayout },
  );

  return { entity: dashboard };
};

export const createDashboardItemResolver: ResolverFn<
  unknown,
  Record<string, never>,
  GraphQLContext,
  {
    dashboardEntityId: EntityId;
    title: string;
    userGoal: string;
    gridPosition: GridPosition;
  }
> = async (
  _,
  { dashboardEntityId, title, userGoal, gridPosition },
  graphQLContext,
) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const item = await createDashboardItem(
    context,
    graphQLContext.authentication,
    { dashboardEntityId, title, userGoal, gridPosition },
  );

  return { entity: item };
};

export const updateDashboardItemResolver: ResolverFn<
  unknown,
  Record<string, never>,
  GraphQLContext,
  {
    itemEntityId: EntityId;
    structuredQuery?: object;
    pythonScript?: string;
    chartConfig?: object;
    chartType?: string;
  }
> = async (
  _,
  { itemEntityId, structuredQuery, pythonScript, chartConfig, chartType },
  graphQLContext,
) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const item = await updateDashboardItem(
    context,
    graphQLContext.authentication,
    {
      itemEntityId,
      structuredQuery,
      pythonScript,
      chartConfig,
      chartType: chartType as any,
    },
  );

  return { entity: item };
};

export const configureDashboardItemResolver: ResolverFn<
  unknown,
  Record<string, never>,
  GraphQLContext,
  { itemEntityId: EntityId; webId: WebId }
> = async (_, { itemEntityId, webId }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { workflowId } = await triggerDashboardItemConfiguration(
    context,
    graphQLContext.authentication,
    { itemEntityId, webId },
  );

  return { workflowId, itemEntityId };
};
```

### Step 3: GraphQL Type Definitions

Create `libs/@local/hash-isomorphic-utils/src/graphql/type-defs/knowledge/dashboard.typedef.ts`:

```typescript
import { gql } from "graphql-tag";

export const dashboardTypeDef = gql`
  # Types

  type DashboardResponse {
    entity: Entity!
    items: [DashboardItemResponse!]
  }

  type DashboardItemResponse {
    entity: Entity!
  }

  type ConfigureDashboardItemResult {
    workflowId: String!
    itemEntityId: EntityId!
  }

  # Inputs

  input GridPositionInput {
    i: String!
    x: Int!
    y: Int!
    w: Int!
    h: Int!
    minW: Int
    maxW: Int
    minH: Int
    maxH: Int
    static: Boolean
  }

  input GridLayoutInput {
    layouts: JSON
    breakpoints: JSON
    cols: JSON
  }

  # Queries

  extend type Query {
    """
    Get a single dashboard by entity ID
    """
    getDashboard(entityId: EntityId!): DashboardResponse

    """
    Get all dashboards for a web
    """
    getDashboards(webId: WebId!): [DashboardResponse!]!
  }

  # Mutations

  extend type Mutation {
    """
    Create a new dashboard
    """
    createDashboard(
      webId: WebId!
      title: String!
      description: String
    ): DashboardResponse!

    """
    Update dashboard grid layout
    """
    updateDashboardLayout(
      entityId: EntityId!
      gridLayout: GridLayoutInput!
    ): DashboardResponse!

    """
    Create a new dashboard item
    """
    createDashboardItem(
      dashboardEntityId: EntityId!
      title: String!
      userGoal: String!
      gridPosition: GridPositionInput!
    ): DashboardItemResponse!

    """
    Update dashboard item configuration
    """
    updateDashboardItem(
      itemEntityId: EntityId!
      structuredQuery: JSON
      pythonScript: String
      chartConfig: JSON
      chartType: String
    ): DashboardItemResponse!

    """
    Trigger LLM configuration for a dashboard item
    """
    configureDashboardItem(
      itemEntityId: EntityId!
      webId: WebId!
    ): ConfigureDashboardItemResult!
  }
`;
```

### Step 4: Register Resolvers

Modify `apps/hash-api/src/graphql/resolvers/index.ts`:

```typescript
// Add import
import {
  getDashboardResolver,
  getDashboardsResolver,
  createDashboardResolver,
  updateDashboardLayoutResolver,
  createDashboardItemResolver,
  updateDashboardItemResolver,
  configureDashboardItemResolver,
} from "./knowledge/dashboard.js";

// Add to Query resolvers:
export const resolvers = {
  Query: {
    // ... existing queries ...
    getDashboard: getDashboardResolver,
    getDashboards: getDashboardsResolver,
  },
  Mutation: {
    // ... existing mutations ...
    createDashboard: createDashboardResolver,
    updateDashboardLayout: updateDashboardLayoutResolver,
    createDashboardItem: createDashboardItemResolver,
    updateDashboardItem: updateDashboardItemResolver,
    configureDashboardItem: configureDashboardItemResolver,
  },
};
```

### Step 5: Export Type Definitions

Modify `libs/@local/hash-isomorphic-utils/src/graphql/type-defs/knowledge/index.ts`:

```typescript
// Add export
export { dashboardTypeDef } from "./dashboard.typedef.js";
```

And ensure it's included in the main schema.

---

## Temporal Workflow

You'll also need to create a Temporal workflow to orchestrate the AI activities. Create this in the AI worker:

`apps/hash-ai-worker-ts/src/workflows/configure-dashboard-item-workflow.ts`:

```typescript
import type { EntityId, WebId } from "@blockprotocol/type-system";
import { proxyActivities } from "@temporalio/workflow";

import type { createFlowActivities } from "../activities/flow-activities.js";
import type { createGraphActivities } from "../activities/graph.js";

const aiActivities = proxyActivities<ReturnType<typeof createFlowActivities>>({
  startToCloseTimeout: "3600 second",
  retry: { maximumAttempts: 3 },
});

const graphActivities = proxyActivities<ReturnType<typeof createGraphActivities>>({
  startToCloseTimeout: "60 second",
  retry: { maximumAttempts: 3 },
});

type ConfigureDashboardItemInput = {
  itemEntityId: EntityId;
  userGoal: string;
  webId: WebId;
  actorId: string;
};

export const configureDashboardItemWorkflow = async (
  input: ConfigureDashboardItemInput,
): Promise<void> => {
  const { itemEntityId, userGoal, webId, actorId } = input;

  try {
    // Step 1: Generate query
    const queryResult = await aiActivities.generateDashboardQueryAction({
      userGoal,
      webId,
    });

    if (queryResult.code !== 0 || !queryResult.contents[0]) {
      throw new Error(`Query generation failed: ${queryResult.message}`);
    }

    const { structuredQuery, suggestedChartTypes } = queryResult.contents[0];

    // Step 2: Analyze data
    const analysisResult = await aiActivities.analyzeDashboardDataAction({
      structuredQuery,
      userGoal,
      targetChartType: suggestedChartTypes?.[0],
      webId,
    });

    if (analysisResult.code !== 0 || !analysisResult.contents[0]) {
      throw new Error(`Data analysis failed: ${analysisResult.message}`);
    }

    const { pythonScript, chartData, suggestedChartType } =
      analysisResult.contents[0];

    // Step 3: Generate chart config
    const configResult = await aiActivities.generateChartConfigAction({
      chartData,
      chartType: suggestedChartType,
      userGoal,
    });

    if (configResult.code !== 0 || !configResult.contents[0]) {
      throw new Error(`Chart config generation failed: ${configResult.message}`);
    }

    const { chartConfig } = configResult.contents[0];

    // Step 4: Update the dashboard item entity
    await graphActivities.updateEntity({
      actorId,
      entityId: itemEntityId,
      properties: {
        "https://hash.ai/@h/types/property-type/structured-query/":
          structuredQuery,
        "https://hash.ai/@h/types/property-type/python-script/": pythonScript,
        "https://hash.ai/@h/types/property-type/chart-configuration/":
          chartConfig,
        "https://hash.ai/@h/types/property-type/chart-type/": suggestedChartType,
        "https://hash.ai/@h/types/property-type/configuration-status/": "ready",
      },
    });
  } catch (error) {
    // Update status to error
    await graphActivities.updateEntity({
      actorId,
      entityId: itemEntityId,
      properties: {
        "https://hash.ai/@h/types/property-type/configuration-status/": "error",
      },
    });
    throw error;
  }
};
```

---

## Completion Criteria

- [ ] Service layer created with all dashboard operations
- [ ] GraphQL resolvers created and registered
- [ ] Type definitions created and exported
- [ ] Temporal workflow created for item configuration
- [ ] `yarn lint:tsc` passes in `apps/hash-api`
- [ ] GraphQL schema generates without errors: `yarn codegen` in frontend

## Interface for Other Agents

Frontend agents can use these GraphQL operations:

```typescript
// Queries
const GET_DASHBOARD = gql`
  query getDashboard($entityId: EntityId!) {
    getDashboard(entityId: $entityId) {
      entity
      items {
        entity
      }
    }
  }
`;

const GET_DASHBOARDS = gql`
  query getDashboards($webId: WebId!) {
    getDashboards(webId: $webId) {
      entity
    }
  }
`;

// Mutations
const CREATE_DASHBOARD = gql`
  mutation createDashboard($webId: WebId!, $title: String!, $description: String) {
    createDashboard(webId: $webId, title: $title, description: $description) {
      entity
    }
  }
`;

const CONFIGURE_DASHBOARD_ITEM = gql`
  mutation configureDashboardItem($itemEntityId: EntityId!, $webId: WebId!) {
    configureDashboardItem(itemEntityId: $itemEntityId, webId: $webId) {
      workflowId
      itemEntityId
    }
  }
`;
```
