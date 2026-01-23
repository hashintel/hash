import { useMutation, useQuery } from "@apollo/client";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type { EntityUuid } from "@blockprotocol/type-system";
import {
  deserializeQueryEntitySubgraphResponse,
  HashEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import type {
  ChartConfig,
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
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { Dashboard } from "@local/hash-isomorphic-utils/system-types/dashboard";
import type { DashboardItem as DashboardItemEntity } from "@local/hash-isomorphic-utils/system-types/dashboarditem";
import { Box, CircularProgress, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import {
  createEntityMutation,
  queryEntitySubgraphQuery,
  updateEntityMutation,
} from "../../graphql/queries/knowledge/entity.queries";
import type { NextPageWithLayout } from "../../shared/layout";
import { getLayoutWithSidebar } from "../../shared/layout";
import { useActiveWorkspace } from "../shared/workspace-context";
import { DashboardGrid } from "./[dashboard-id].page/dashboard-grid";
import { DashboardHeader } from "./[dashboard-id].page/dashboard-header";
import { ItemConfigModal } from "./[dashboard-id].page/item-config-modal";
import type { DashboardData, DashboardItemData } from "./shared/types";

const DashboardPage: NextPageWithLayout = () => {
  const router = useRouter();
  const dashboardUuid = router.query["dashboard-id"] as EntityUuid | undefined;

  const { activeWorkspaceWebId } = useActiveWorkspace();

  const [isEditing, setIsEditing] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DashboardItemData | null>(
    null,
  );

  // Query for the dashboard and its linked items
  const {
    data: dashboardData,
    loading,
    refetch,
  } = useQuery<QueryEntitySubgraphQuery, QueryEntitySubgraphQueryVariables>(
    queryEntitySubgraphQuery,
    {
      variables: {
        request: {
          filter: {
            equal: [{ path: ["uuid"] }, { parameter: dashboardUuid }],
          },
          graphResolveDepths: {
            inheritsFrom: 255,
            isOfType: true,
          },
          // Traverse outgoing "Has" links to get dashboard items
          traversalPaths: [
            {
              edges: [
                { kind: "has-left-entity", direction: "incoming" },
                { kind: "has-right-entity", direction: "outgoing" },
              ],
            },
          ],
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: false,
          includePermissions: true,
        },
      },
      skip: !dashboardUuid,
      fetchPolicy: "cache-and-network",
    },
  );

  const dashboard = useMemo<DashboardData | null>(() => {
    if (!dashboardData) {
      return null;
    }

    const { subgraph } = deserializeQueryEntitySubgraphResponse<Dashboard>(
      dashboardData.queryEntitySubgraph,
    );

    const dashboardEntities = getRoots(subgraph);
    const dashboardEntity = dashboardEntities[0];

    if (!dashboardEntity) {
      return null;
    }

    const { name, description, gridLayout } = simplifyProperties(
      dashboardEntity.properties,
    );

    const outgoingLinks = getOutgoingLinkAndTargetEntities(
      subgraph,
      dashboardEntity.metadata.recordId.entityId,
    );

    const items: DashboardItemData[] = [];

    for (const { linkEntity, rightEntity } of outgoingLinks) {
      const link = linkEntity[0];
      if (
        !link?.metadata.entityTypeIds.includes(
          systemLinkEntityTypes.has.linkEntityTypeId,
        )
      ) {
        continue;
      }

      const itemEntity = rightEntity[0] as
        | HashEntity<DashboardItemEntity>
        | undefined;

      if (!itemEntity) {
        continue;
      }

      const itemProps = simplifyProperties(itemEntity.properties);
      const itemEntityId = itemEntity.metadata.recordId.entityId;

      items.push({
        entityId: itemEntityId,
        title: itemProps.name,
        userGoal: itemProps.goal,
        chartType: itemProps.chartType as ChartType,
        chartData: null, // Chart data is computed at runtime
        chartConfig: itemProps.chartConfiguration as ChartConfig,
        gridPosition: itemProps.gridPosition as GridPosition,
        configurationStatus:
          itemProps.configurationStatus as DashboardItemData["configurationStatus"],
      });
    }

    return {
      entityId: dashboardEntity.metadata.recordId.entityId,
      title: name,
      description,
      gridLayout: gridLayout as DashboardGridLayout,
      items,
    };
  }, [dashboardData]);

  const canEdit = useMemo((): boolean => {
    if (!dashboard) {
      return false;
    }
    return !!dashboardData?.queryEntitySubgraph.entityPermissions?.[
      dashboard.entityId
    ]?.update;
  }, [dashboard, dashboardData]);

  // Auto-enable edit mode when there are no items and user has permission
  useEffect(() => {
    if (dashboard && canEdit && dashboard.items.length === 0) {
      setIsEditing(true);
    }
  }, [dashboard, canEdit]);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

  const handleLayoutChange = useCallback(
    async (newLayout: GridPosition[]) => {
      if (!dashboard) {
        return;
      }

      // Update each item's grid position
      const updatePromises = dashboard.items.map(async (item) => {
        const layoutItem = newLayout.find(
          (layoutEntry) => layoutEntry.i === item.gridPosition.i,
        );

        if (layoutItem) {
          await updateEntity({
            variables: {
              entityUpdate: {
                entityId: item.entityId,
                propertyPatches: [
                  {
                    op: "add",
                    path: [
                      systemPropertyTypes.gridPosition.propertyTypeBaseUrl,
                    ],
                    property: {
                      value: {
                        i: layoutItem.i,
                        x: layoutItem.x,
                        y: layoutItem.y,
                        w: layoutItem.w,
                        h: layoutItem.h,
                      },
                      metadata: {
                        dataTypeId:
                          "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                      },
                    },
                  },
                ],
              },
            },
          });
        }
      });

      await Promise.all(updatePromises);
      void refetch();
    },
    [dashboard, updateEntity, refetch],
  );

  const handleItemConfigureClick = useCallback((item: DashboardItemData) => {
    setSelectedItem(item);
    setConfigModalOpen(true);
  }, []);

  const handleItemRefreshClick = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleAddItem = useCallback(async () => {
    if (!dashboard?.entityId) {
      return;
    }

    const { data: itemData } = await createEntity({
      variables: {
        entityTypeIds: [systemEntityTypes.dashboardItem.entityTypeId],
        webId: activeWorkspaceWebId,
        properties: mergePropertyObjectAndMetadata<DashboardItemEntity>(
          {
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "New Chart",
            "https://hash.ai/@h/types/property-type/goal/": "",
            "https://hash.ai/@h/types/property-type/configuration-status/":
              "pending",
            "https://hash.ai/@h/types/property-type/grid-position/": {
              i: `item-${Date.now()}`,
              x: 0,
              y: Infinity, // Place at bottom
              w: 6,
              h: 4,
            },
          },
          undefined,
        ),
      },
    });

    const newItemEntity = itemData?.createEntity
      ? new HashEntity(itemData.createEntity)
      : null;

    if (!newItemEntity) {
      return;
    }

    await createEntity({
      variables: {
        entityTypeIds: [systemLinkEntityTypes.has.linkEntityTypeId],
        webId: activeWorkspaceWebId,
        properties: mergePropertyObjectAndMetadata({}, undefined),
        linkData: {
          leftEntityId: dashboard.entityId,
          rightEntityId: newItemEntity.metadata.recordId.entityId,
        },
      },
    });

    // Refetch and open the config modal for the new item
    await refetch();

    setSelectedItem({
      entityId: newItemEntity.metadata.recordId.entityId,
      title: "New Chart",
      userGoal: "",
      chartType: null,
      chartData: null,
      chartConfig: null,
      gridPosition: {
        i: `item-${Date.now()}`,
        x: 0,
        y: 0,
        w: 6,
        h: 4,
      },
      configurationStatus: "pending",
    });
    setConfigModalOpen(true);
  }, [dashboard?.entityId, activeWorkspaceWebId, createEntity, refetch]);

  const handleCloseConfigModal = useCallback(() => {
    setConfigModalOpen(false);
    setSelectedItem(null);
    void refetch();
  }, [refetch]);

  if (loading && !dashboard) {
    return (
      <Container maxWidth={false} sx={{ py: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "50vh",
          }}
        >
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!dashboard) {
    return (
      <Container maxWidth={false} sx={{ py: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "50vh",
          }}
        >
          <Typography variant="h5" color="text.secondary">
            Dashboard not found
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <DashboardHeader
        title={dashboard.title}
        description={dashboard.description}
        isEditing={isEditing}
        canEdit={canEdit}
        onEditToggle={() => setIsEditing(!isEditing)}
        onAddItem={handleAddItem}
      />

      <DashboardGrid
        dashboard={dashboard}
        onLayoutChange={handleLayoutChange}
        onItemConfigureClick={handleItemConfigureClick}
        onItemRefreshClick={handleItemRefreshClick}
        onCanvasClick={handleAddItem}
        isEditing={isEditing}
        canEdit={canEdit}
      />

      {selectedItem && activeWorkspaceWebId && (
        <ItemConfigModal
          open={configModalOpen}
          onClose={handleCloseConfigModal}
          itemEntityId={selectedItem.entityId}
          webId={activeWorkspaceWebId}
          initialGoal={selectedItem.userGoal}
        />
      )}
    </Container>
  );
};

DashboardPage.getLayout = (page) => getLayoutWithSidebar(page, {});

export default DashboardPage;
