import type { EntityId, WebId } from "@blockprotocol/type-system";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import type {
  ChartType,
  DashboardGridLayout,
  GridPosition,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import {
  createDashboard,
  createDashboardItem,
  getDashboardById,
  getDashboardItems,
  getDashboardsForWeb,
  updateDashboardItem,
  updateDashboardLayout,
} from "../../../graph/knowledge/system-types/dashboard";
import type { ResolverFn } from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";
import { graphQLContextToImpureGraphContext } from "../util";

// Response types for dashboard GraphQL operations
type DashboardItemResponse = {
  entity: SerializedEntity;
};

type DashboardResponse = {
  entity: SerializedEntity;
  items: DashboardItemResponse[];
};

type ConfigureDashboardItemResult = {
  workflowId: string;
  itemEntityId: EntityId;
};

// Query Resolvers

export const getDashboardResolver: ResolverFn<
  Promise<DashboardResponse | null>,
  Record<string, never>,
  LoggedInGraphQLContext,
  { entityId: string }
> = async (_, { entityId }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const dashboard = await getDashboardById(context, authentication, {
    dashboardEntityId: entityId as EntityId,
  });

  const items = await getDashboardItems(context, authentication, {
    dashboardEntityId: entityId as EntityId,
  });

  return {
    entity: dashboard.toJSON(),
    items: items.map((item) => ({ entity: item.toJSON() })),
  };
};

export const getDashboardsResolver: ResolverFn<
  Promise<DashboardResponse[]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  { webId: string }
> = async (_, { webId }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const dashboards = await getDashboardsForWeb(context, authentication, {
    webId: webId as WebId,
  });

  return dashboards.map((dashboard) => ({
    entity: dashboard.toJSON(),
    items: [],
  }));
};

// Mutation Resolvers

export const createDashboardResolver: ResolverFn<
  Promise<DashboardResponse>,
  Record<string, never>,
  LoggedInGraphQLContext,
  { webId: string; title: string; description?: string | null }
> = async (_, { webId, title, description }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const dashboard = await createDashboard(context, authentication, {
    webId: webId as WebId,
    title,
    description: description ?? undefined,
  });

  return {
    entity: dashboard.toJSON(),
    items: [],
  };
};

export const updateDashboardLayoutResolver: ResolverFn<
  Promise<DashboardResponse>,
  Record<string, never>,
  LoggedInGraphQLContext,
  { entityId: string; gridLayout: DashboardGridLayout }
> = async (_, { entityId, gridLayout }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const dashboard = await updateDashboardLayout(context, authentication, {
    dashboardEntityId: entityId as EntityId,
    gridLayout,
  });

  return {
    entity: dashboard.toJSON(),
    items: [],
  };
};

export const createDashboardItemResolver: ResolverFn<
  Promise<DashboardItemResponse>,
  Record<string, never>,
  LoggedInGraphQLContext,
  {
    dashboardEntityId: string;
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
  const { authentication } = graphQLContext;

  const item = await createDashboardItem(context, authentication, {
    dashboardEntityId: dashboardEntityId as EntityId,
    title,
    userGoal,
    gridPosition,
  });

  return {
    entity: item.toJSON(),
  };
};

export const updateDashboardItemResolver: ResolverFn<
  Promise<DashboardItemResponse>,
  Record<string, never>,
  LoggedInGraphQLContext,
  {
    itemEntityId: string;
    structuredQuery?: object | null;
    pythonScript?: string | null;
    chartConfig?: object | null;
    chartType?: string | null;
  }
> = async (
  _,
  { itemEntityId, structuredQuery, pythonScript, chartConfig, chartType },
  graphQLContext,
) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const item = await updateDashboardItem(context, authentication, {
    itemEntityId: itemEntityId as EntityId,
    structuredQuery: structuredQuery ?? undefined,
    pythonScript: pythonScript ?? undefined,
    chartConfig: chartConfig ?? undefined,
    chartType: (chartType as ChartType) ?? undefined,
  });

  return {
    entity: item.toJSON(),
  };
};

export const configureDashboardItemResolver: ResolverFn<
  Promise<ConfigureDashboardItemResult>,
  Record<string, never>,
  LoggedInGraphQLContext,
  { itemEntityId: string; webId: string }
> = async (_, { itemEntityId, webId }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication, temporal, user } = graphQLContext;

  if (!user.enabledFeatureFlags.includes("ai")) {
    throw new Error("AI features are not enabled for this user");
  }

  // Update the item status to configuring
  await updateDashboardItem(context, authentication, {
    itemEntityId: itemEntityId as EntityId,
    configurationStatus: "configuring",
  });

  // Start Temporal workflow
  const workflowId = `dashboard-item-config-${generateUuid()}`;

  await temporal.workflow.start("configureDashboardItemWorkflow", {
    taskQueue: "ai",
    workflowId,
    args: [
      {
        itemEntityId,
        webId,
        actorId: authentication.actorId,
      },
    ],
    retry: {
      maximumAttempts: 1,
    },
  });

  return {
    workflowId,
    itemEntityId: itemEntityId as EntityId,
  };
};
