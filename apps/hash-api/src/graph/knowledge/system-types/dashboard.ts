import type {
  EntityId,
  PropertyPatchOperation,
  WebId,
} from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import type { HashEntity, HashLinkEntity } from "@local/hash-graph-sdk/entity";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import type {
  ChartType,
  DashboardGridLayout,
  GridPosition,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  Dashboard,
  DashboardItem,
  DashboardItemPropertiesWithMetadata,
  DashboardPropertiesWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/dashboard";

import type { ImpureGraphFunction } from "../../context-types";
import {
  createEntity,
  getLatestEntityById,
  updateEntity,
} from "../primitive/entity";
import { createLinkEntity } from "../primitive/link-entity";

const isEntityDashboardEntity = (
  entity: HashEntity,
): entity is HashEntity<Dashboard> =>
  entity.metadata.entityTypeIds.includes(
    systemEntityTypes.dashboard.entityTypeId,
  );

const isEntityDashboardItemEntity = (
  entity: HashEntity,
): entity is HashEntity<DashboardItem> =>
  entity.metadata.entityTypeIds.includes(
    systemEntityTypes.dashboardItem.entityTypeId,
  );

export type CreateDashboardParams = {
  webId: WebId;
  title: string;
  description?: string;
};

export type UpdateDashboardLayoutParams = {
  dashboardEntityId: EntityId;
  gridLayout: DashboardGridLayout;
};

export type CreateDashboardItemParams = {
  dashboardEntityId: EntityId;
  title: string;
  userGoal: string;
  gridPosition: GridPosition;
};

export type UpdateDashboardItemParams = {
  itemEntityId: EntityId;
  structuralQuery?: object;
  pythonScript?: string;
  chartConfig?: object;
  chartType?: ChartType;
  configurationStatus?: string;
};

/**
 * Create a new Dashboard entity
 */
export const createDashboard: ImpureGraphFunction<
  CreateDashboardParams,
  Promise<HashEntity<Dashboard>>
> = async (context, authentication, params) => {
  const { webId, title, description } = params;

  const properties: DashboardPropertiesWithMetadata = {
    value: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/": {
        value: title,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
      ...(description
        ? {
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              {
                value: description,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              },
          }
        : {}),
    },
  };

  const entity = await createEntity<Dashboard>(context, authentication, {
    webId,
    entityTypeIds: [systemEntityTypes.dashboard.entityTypeId],
    properties,
  });

  return entity;
};

/**
 * Get a Dashboard by entity ID
 */
export const getDashboardById: ImpureGraphFunction<
  { dashboardEntityId: EntityId },
  Promise<HashEntity<Dashboard>>
> = async (context, authentication, { dashboardEntityId }) => {
  const entity = await getLatestEntityById(context, authentication, {
    entityId: dashboardEntityId,
  });

  if (!isEntityDashboardEntity(entity)) {
    throw new Error(`Entity ${dashboardEntityId} is not a Dashboard entity`);
  }

  return entity;
};

/**
 * Get all Dashboards for a web
 */
export const getDashboardsForWeb: ImpureGraphFunction<
  { webId: WebId },
  Promise<HashEntity<Dashboard>[]>
> = async (context, authentication, { webId }) => {
  const { entities } = await queryEntities(context, authentication, {
    filter: {
      all: [
        {
          equal: [
            { path: ["type", "baseUrl"] },
            { parameter: systemEntityTypes.dashboard.entityTypeBaseUrl },
          ],
        },
        {
          equal: [{ path: ["webId"] }, { parameter: webId }],
        },
        {
          equal: [{ path: ["archived"] }, { parameter: false }],
        },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: false,
    includePermissions: false,
  });

  return entities.filter(isEntityDashboardEntity);
};

/**
 * Update Dashboard grid layout
 */
export const updateDashboardLayout: ImpureGraphFunction<
  UpdateDashboardLayoutParams,
  Promise<HashEntity<Dashboard>>,
  false,
  true
> = async (context, authentication, params) => {
  const { dashboardEntityId, gridLayout } = params;

  const existingEntity = await getDashboardById(context, authentication, {
    dashboardEntityId,
  });

  const updatedEntity = await updateEntity<Dashboard>(context, authentication, {
    entity: existingEntity,
    propertyPatches: [
      {
        op: "add",
        path: [systemPropertyTypes.gridLayout.propertyTypeBaseUrl],
        property: {
          value: gridLayout,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
          },
        },
      },
    ],
  });

  return updatedEntity;
};

/**
 * Create a new Dashboard Item and link it to a Dashboard
 */
export const createDashboardItem: ImpureGraphFunction<
  CreateDashboardItemParams,
  Promise<HashEntity<DashboardItem>>
> = async (context, authentication, params) => {
  const { dashboardEntityId, title, userGoal, gridPosition } = params;

  // Get the dashboard to verify it exists and get its webId
  const dashboard = await getDashboardById(context, authentication, {
    dashboardEntityId,
  });

  // Extract webId from the dashboard's entityId
  const [webId] = dashboard.metadata.recordId.entityId.split("~") as [
    WebId,
    string,
  ];

  // Create the Dashboard Item entity
  const properties: DashboardItemPropertiesWithMetadata = {
    value: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/": {
        value: title,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
      "https://hash.ai/@h/types/property-type/goal/": {
        value: userGoal,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
      "https://hash.ai/@h/types/property-type/grid-position/": {
        value: gridPosition,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        },
      },
      "https://hash.ai/@h/types/property-type/configuration-status/": {
        value: "pending",
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
    },
  };

  const itemEntity = await createEntity<DashboardItem>(
    context,
    authentication,
    {
      webId,
      entityTypeIds: [systemEntityTypes.dashboardItem.entityTypeId],
      properties,
    },
  );

  // Create link from Dashboard to Dashboard Item
  await createLinkEntity(context, authentication, {
    webId,
    entityTypeIds: [systemLinkEntityTypes.has.linkEntityTypeId],
    properties: { value: {} },
    linkData: {
      leftEntityId: dashboardEntityId,
      rightEntityId: itemEntity.metadata.recordId.entityId,
    },
  });

  return itemEntity;
};

/**
 * Get a Dashboard Item by entity ID
 */
export const getDashboardItemById: ImpureGraphFunction<
  { itemEntityId: EntityId },
  Promise<HashEntity<DashboardItem>>
> = async (context, authentication, { itemEntityId }) => {
  const entity = await getLatestEntityById(context, authentication, {
    entityId: itemEntityId,
  });

  if (!isEntityDashboardItemEntity(entity)) {
    throw new Error(`Entity ${itemEntityId} is not a DashboardItem entity`);
  }

  return entity;
};

/**
 * Update Dashboard Item properties
 */
export const updateDashboardItem: ImpureGraphFunction<
  UpdateDashboardItemParams,
  Promise<HashEntity<DashboardItem>>,
  false,
  true
> = async (context, authentication, params) => {
  const {
    itemEntityId,
    structuralQuery,
    pythonScript,
    chartConfig,
    chartType,
    configurationStatus,
  } = params;

  const existingEntity = await getDashboardItemById(context, authentication, {
    itemEntityId,
  });

  const propertyPatches: Parameters<typeof updateEntity>[2]["propertyPatches"] =
    [];

  if (structuralQuery !== undefined) {
    propertyPatches.push({
      op: "add",
      path: [systemPropertyTypes.structuralQuery.propertyTypeBaseUrl],
      property: {
        value: structuralQuery,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        },
      },
    } as PropertyPatchOperation);
  }

  if (pythonScript !== undefined) {
    propertyPatches.push({
      op: "add",
      path: [systemPropertyTypes.pythonScript.propertyTypeBaseUrl],
      property: {
        value: pythonScript,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
    });
  }

  if (chartConfig !== undefined) {
    propertyPatches.push({
      op: "add",
      path: [systemPropertyTypes.chartConfiguration.propertyTypeBaseUrl],
      property: {
        value: chartConfig,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        },
      },
    } as PropertyPatchOperation);
  }

  if (chartType !== undefined) {
    propertyPatches.push({
      op: "add",
      path: [systemPropertyTypes.chartType.propertyTypeBaseUrl],
      property: {
        value: chartType,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
    });
  }

  if (configurationStatus !== undefined) {
    propertyPatches.push({
      op: "replace",
      path: [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl],
      property: {
        value: configurationStatus,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
    });
  }

  if (propertyPatches.length === 0) {
    return existingEntity;
  }

  const updatedEntity = await updateEntity<DashboardItem>(
    context,
    authentication,
    {
      entity: existingEntity,
      propertyPatches,
    },
  );

  return updatedEntity;
};

/**
 * Get Dashboard Items for a Dashboard
 */
export const getDashboardItems: ImpureGraphFunction<
  { dashboardEntityId: EntityId },
  Promise<HashEntity<DashboardItem>[]>
> = async (context, authentication, { dashboardEntityId }) => {
  const dashboardUuid = extractEntityUuidFromEntityId(dashboardEntityId);

  // Find all link entities that connect the dashboard to items
  const { entities: linkEntities } = await queryEntities(
    context,
    authentication,
    {
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "baseUrl"] },
              {
                parameter: systemLinkEntityTypes.has.linkEntityTypeBaseUrl,
              },
            ],
          },
          {
            equal: [
              { path: ["leftEntity", "uuid"] },
              { parameter: dashboardUuid },
            ],
          },
          {
            equal: [{ path: ["archived"] }, { parameter: false }],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  // Get the right entities (dashboard items) from the links
  const itemEntityIds = linkEntities
    .filter((entity): entity is HashLinkEntity => !!entity.linkData)
    .map((linkEntity) => linkEntity.linkData.rightEntityId);

  if (itemEntityIds.length === 0) {
    return [];
  }

  // Fetch all dashboard items
  const items = await Promise.all(
    itemEntityIds.map((entityId) =>
      getLatestEntityById(context, authentication, { entityId }),
    ),
  );

  return items.filter(isEntityDashboardItemEntity);
};
