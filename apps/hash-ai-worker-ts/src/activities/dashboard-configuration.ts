import type {
  ActorEntityUuid,
  EntityId,
  PropertyPatchOperation,
  ProvidedEntityEditionProvenance,
  WebId,
} from "@blockprotocol/type-system";
import { splitEntityId } from "@blockprotocol/type-system";
import type { Filter, GraphApi } from "@local/hash-graph-client";
import { type HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { DashboardItem } from "@local/hash-isomorphic-utils/system-types/dashboard";

import { logger } from "./shared/activity-logger.js";
import { analyzeEntityData } from "./shared/analyze-entity-data.js";
import { generateChartConfig } from "./shared/generate-chart-config.js";
import { generateStructuralQuery } from "./shared/generate-structural-query.js";

type AuthenticationContext = {
  actorId: ActorEntityUuid;
};

const defaultProvenance: ProvidedEntityEditionProvenance = {
  actorType: "machine",
  origin: { type: "flow" },
};

// ============================================================================
// Shared Helpers
// ============================================================================

const getEntityById = async (
  graphApiClient: GraphApi,
  authentication: AuthenticationContext,
  entityId: EntityId,
): Promise<HashEntity> => {
  const [webId, entityUuid] = splitEntityId(entityId);

  const {
    entities: [entity, ...unexpectedEntities],
  } = await queryEntities({ graphApi: graphApiClient }, authentication, {
    filter: {
      all: [
        { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
        { equal: [{ path: ["webId"] }, { parameter: webId }] },
        { equal: [{ path: ["archived"] }, { parameter: false }] },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: false,
    includePermissions: false,
  });

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: Entity with entityId ${entityId} returned more than one result.`,
    );
  }

  if (!entity) {
    throw new Error(
      `Critical: Entity with entityId ${entityId} doesn't exist or cannot be accessed.`,
    );
  }

  return entity;
};

// ============================================================================
// Activity Types
// ============================================================================

export type GetDashboardItemParams = {
  authentication: AuthenticationContext;
  itemEntityId: EntityId;
};

export type GetDashboardItemResult = {
  userGoal: string;
};

export type GenerateDashboardQueryParams = {
  authentication: AuthenticationContext;
  userGoal: string;
  webId: WebId;
  itemEntityId: EntityId;
};

export type GenerateDashboardQueryResult = {
  structuralQuery: Filter;
  suggestedChartType: ChartType;
};

export type AnalyzeDashboardDataParams = {
  authentication: AuthenticationContext;
  structuralQuery: Filter;
  userGoal: string;
  suggestedChartType: ChartType;
  webId: WebId;
  itemEntityId: EntityId;
};

export type AnalyzeDashboardDataResult = {
  pythonScript: string;
  chartData: unknown[];
};

export type GenerateDashboardChartConfigParams = {
  authentication: AuthenticationContext;
  userGoal: string;
  suggestedChartType: ChartType;
  chartData: unknown[];
  webId: WebId;
  itemEntityId: EntityId;
};

export type GenerateDashboardChartConfigResult = {
  chartConfig: ChartConfig;
};

export type UpdateDashboardItemParams = {
  authentication: AuthenticationContext;
  itemEntityId: EntityId;
  propertyPatches: PropertyPatchOperation[];
};

export type UpdateDashboardItemStatusParams = {
  authentication: AuthenticationContext;
  itemEntityId: EntityId;
  status: string;
  errorMessage?: string;
};

// ============================================================================
// Activity Factory
// ============================================================================

export const createDashboardConfigurationActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  /**
   * Get a dashboard item entity and extract the user goal.
   */
  async getDashboardItem(
    params: GetDashboardItemParams,
  ): Promise<GetDashboardItemResult> {
    const { authentication, itemEntityId } = params;

    const itemEntity = (await getEntityById(
      graphApiClient,
      authentication,
      itemEntityId,
    )) as HashEntity<DashboardItem>;

    const userGoal: string | undefined =
      itemEntity.properties["https://hash.ai/@h/types/property-type/goal/"];

    if (!userGoal) {
      throw new Error("Dashboard item is missing user goal");
    }

    return { userGoal };
  },

  /**
   * Generate a structural query for the dashboard item based on the user goal.
   * Uses the shared generateStructuralQuery function.
   */
  async generateDashboardQuery(
    params: GenerateDashboardQueryParams,
  ): Promise<GenerateDashboardQueryResult> {
    const { authentication, userGoal, webId, itemEntityId } = params;

    logger.info(`[Dashboard Config] Generating query for: ${userGoal}`);

    const { structuralQuery, suggestedChartTypes } =
      await generateStructuralQuery({
        userGoal,
        webId,
        authentication,
        graphApiClient,
        incurredInEntityId: itemEntityId,
        stepId: "dashboard-query",
      });

    // Use first suggested chart type, default to bar
    const suggestedChartType: ChartType = suggestedChartTypes[0] ?? "bar";

    return { structuralQuery, suggestedChartType };
  },

  /**
   * Analyze data using the structural query and generate a Python transformation script.
   * Uses the shared analyzeEntityData function.
   */
  async analyzeDashboardData(
    params: AnalyzeDashboardDataParams,
  ): Promise<AnalyzeDashboardDataResult> {
    const {
      authentication,
      structuralQuery,
      userGoal,
      suggestedChartType,
      webId,
      itemEntityId,
    } = params;

    logger.info(`[Dashboard Config] Analyzing data...`);

    const { pythonScript, chartData } = await analyzeEntityData({
      structuralQuery,
      userGoal,
      targetChartType: suggestedChartType,
      authentication,
      graphApiClient,
      webId,
      incurredInEntityId: itemEntityId,
      stepId: "dashboard-analysis",
    });

    return { pythonScript, chartData };
  },

  /**
   * Generate chart configuration based on the chart data.
   * Uses the shared generateChartConfig function.
   */
  async generateDashboardChartConfig(
    params: GenerateDashboardChartConfigParams,
  ): Promise<GenerateDashboardChartConfigResult> {
    const {
      authentication,
      userGoal,
      suggestedChartType,
      chartData,
      webId,
      itemEntityId,
    } = params;

    logger.info(`[Dashboard Config] Generating chart config...`);

    const { chartConfig } = await generateChartConfig({
      chartData,
      chartType: suggestedChartType,
      userGoal,
      authentication,
      graphApiClient,
      webId,
      incurredInEntityId: itemEntityId,
      stepId: "dashboard-chart",
    });

    return { chartConfig };
  },

  /**
   * Update a dashboard item entity with property patches.
   */
  async updateDashboardItem(params: UpdateDashboardItemParams): Promise<void> {
    const { authentication, itemEntityId, propertyPatches } = params;

    const itemEntity = await getEntityById(
      graphApiClient,
      authentication,
      itemEntityId,
    );

    await itemEntity.patch(graphApiClient, authentication, {
      propertyPatches,
      provenance: defaultProvenance,
    });
  },

  /**
   * Update the status of a dashboard item.
   */
  async updateDashboardItemStatus(
    params: UpdateDashboardItemStatusParams,
  ): Promise<void> {
    const { authentication, itemEntityId, status, errorMessage } = params;

    const itemEntity = await getEntityById(
      graphApiClient,
      authentication,
      itemEntityId,
    );

    if (errorMessage) {
      logger.error(
        `Dashboard item ${itemEntityId} configuration failed: ${errorMessage}`,
      );
    }

    await itemEntity.patch(graphApiClient, authentication, {
      propertyPatches: [
        {
          op: "replace",
          path: [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl],
          property: {
            value: status,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      ],
      provenance: defaultProvenance,
    });
  },
});
