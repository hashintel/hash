import type {
  ActorEntityUuid,
  EntityId,
  ProvidedEntityEditionProvenance,
  WebId,
} from "@blockprotocol/type-system";
import { splitEntityId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { DashboardItem } from "@local/hash-isomorphic-utils/system-types/dashboard";

type AuthenticationContext = {
  actorId: ActorEntityUuid;
};

type ConfigureDashboardItemParams = {
  authentication: AuthenticationContext;
  itemEntityId: EntityId;
  webId: WebId;
};

type UpdateDashboardItemStatusParams = {
  authentication: AuthenticationContext;
  itemEntityId: EntityId;
  status: string;
  errorMessage?: string;
};

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
        {
          equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
        },
        {
          equal: [{ path: ["webId"] }, { parameter: webId }],
        },
        { equal: [{ path: ["archived"] }, { parameter: false }] },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: false,
    includePermissions: false,
  });

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: Latest entity with entityId ${entityId} returned more than one result.`,
    );
  }

  if (!entity) {
    throw new Error(
      `Critical: Entity with entityId ${entityId} doesn't exist or cannot be accessed by requesting user.`,
    );
  }

  return entity;
};

const defaultProvenance: ProvidedEntityEditionProvenance = {
  actorType: "machine",
  origin: {
    type: "flow",
  },
};

export const createDashboardConfigurationActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  /**
   * Configure a dashboard item by generating query, analyzing data, and creating chart config.
   * This activity orchestrates the full configuration process.
   */
  async configureDashboardItem(
    params: ConfigureDashboardItemParams,
  ): Promise<void> {
    const { authentication, itemEntityId } = params;

    // Get the dashboard item entity
    const itemEntity = (await getEntityById(
      graphApiClient,
      authentication,
      itemEntityId,
    )) as HashEntity<DashboardItem>;

    const userGoal =
      itemEntity.properties[
        "https://hash.ai/@h/types/property-type/user-goal/"
      ];

    if (!userGoal) {
      throw new Error("Dashboard item is missing user goal");
    }

    // Update status to configuring
    await itemEntity.patch(graphApiClient, authentication, {
      propertyPatches: [
        {
          op: "replace",
          path: [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl],
          property: {
            value: "configuring",
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      ],
      provenance: defaultProvenance,
    });

    // TODO: In a full implementation, this would:
    // 1. Call an LLM to generate a structured query based on userGoal and available entity types in webId
    // 2. Execute the query to get sample data
    // 3. Call an LLM to generate a Python script for data transformation
    // 4. Execute the Python script in a sandbox
    // 5. Call an LLM to generate chart configuration
    // 6. Update the dashboard item with all generated data

    // For now, mark as ready with placeholder configuration
    // The actual LLM integration can be added later using the existing
    // generateDashboardQueryAction, analyzeDashboardDataAction, and generateChartConfigAction
    // activities which are designed for the flow system

    const refetchedEntity = (await getEntityById(
      graphApiClient,
      authentication,
      itemEntityId,
    )) as HashEntity<DashboardItem>;

    await refetchedEntity.patch(graphApiClient, authentication, {
      propertyPatches: [
        {
          op: "replace",
          path: [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl],
          property: {
            value: "ready",
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
        {
          op: "add",
          path: [systemPropertyTypes.chartType.propertyTypeBaseUrl],
          property: {
            value: "bar",
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
        {
          op: "add",
          path: [systemPropertyTypes.chartConfig.propertyTypeBaseUrl],
          property: {
            value: {
              categoryKey: "name",
              series: [{ type: "bar", dataKey: "value" }],
              showLegend: true,
              showGrid: true,
              showTooltip: true,
            },
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            },
          },
        },
      ],
      provenance: defaultProvenance,
    });
  },

  /**
   * Update the status of a dashboard item.
   */
  async updateDashboardItemStatus(
    params: UpdateDashboardItemStatusParams,
  ): Promise<void> {
    const { authentication, itemEntityId, status } = params;

    const itemEntity = await getEntityById(
      graphApiClient,
      authentication,
      itemEntityId,
    );

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
