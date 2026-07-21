import { useMutation, useQuery } from "@apollo/client";
import { Box, CircularProgress, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import { PortalContainerContext } from "@hashintel/ds-components";
import {
  deserializeQueryEntitySubgraphResponse,
  HashEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import {
  type ChartConfig,
  type ChartType,
  type DashboardGridLayout,
  type GridPosition,
  normalizeStructuralQuery,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import {
  archiveEntitiesMutation,
  createEntityMutation,
  queryEntitySubgraphQuery,
  updateEntityMutation,
} from "../../graphql/queries/knowledge/entity.queries";
import { getLayoutWithSidebar } from "../../shared/layout";
import { useSlideStack } from "../shared/slide-stack";
import { useActiveWorkspace } from "../shared/workspace-context";
import { DashboardGrid } from "./[dashboard-id].page/dashboard-grid";
import { DashboardHeader } from "./[dashboard-id].page/dashboard-header";
import { ItemConfigModal } from "./[dashboard-id].page/item-config-modal";
import { useDashboardItemGenerations } from "./hooks/use-dashboard-item-generations";

import type {
  ArchiveEntitiesMutation,
  ArchiveEntitiesMutationVariables,
  CreateEntityMutation,
  CreateEntityMutationVariables,
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import type { NextPageWithLayout } from "../../shared/layout";
import type { DashboardData, DashboardItemData } from "./shared/types";
import type { EntityId, EntityUuid } from "@blockprotocol/type-system";
import type { Dashboard } from "@local/hash-isomorphic-utils/system-types/dashboard";
import type { DashboardItem as DashboardItemEntity } from "@local/hash-isomorphic-utils/system-types/dashboarditem";

type DashboardContainerProps = {
  children: React.ReactNode;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
};

/**
 * Wraps the page in `.hash-ds-root` so `@hashintel/ds-components` token CSS
 * variables resolve, and supplies the element as the portal container so ds
 * overlays (tooltips, selects) render inside the token scope.
 */
const DashboardContainer = ({
  children,
  containerRef,
  isFullscreen,
}: DashboardContainerProps) => {
  return (
    <PortalContainerContext.Provider value={containerRef}>
      <Container
        ref={containerRef}
        className="hash-ds-root"
        sx={{
          maxWidth: { lg: 1400 },
          py: 5,
          ...(isFullscreen && {
            maxWidth: "100% !important",
            height: "100vh",
            overflow: "auto",
            backgroundColor: ({ palette }) => palette.common.white,
          }),
        }}
      >
        {children}
      </Container>
    </PortalContainerContext.Provider>
  );
};

const DashboardPage: NextPageWithLayout = () => {
  const router = useRouter();
  const dashboardUuid = router.query["dashboard-id"] as EntityUuid | undefined;

  const { activeWorkspaceWebId } = useActiveWorkspace();
  const { pushToSlideStack } = useSlideStack();

  const [isEditing, setIsEditing] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DashboardItemData | null>(
    null,
  );
  const [configModalItemEntityId, setConfigModalItemEntityId] =
    useState<EntityId | null>(null);
  /** Whether the config modal is open for a not-yet-created item */
  const [isAddingNewItem, setIsAddingNewItem] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredEntityId, setHoveredEntityId] = useState<EntityId | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsEditing(false);
    setConfigModalOpen(false);
    setSelectedItem(null);
    setConfigModalItemEntityId(null);
    setIsAddingNewItem(false);
    setHoveredEntityId(null);
  }, [dashboardUuid]);

  // Listen for fullscreen changes (e.g., user pressing Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleFullscreenToggle = useCallback(async () => {
    if (!containerRef.current) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current.requestFullscreen();
    }
  }, []);

  // Handle clicking on an entity within a chart or dashboard item
  const handleEntityClick = useCallback(
    (entityId: EntityId) => {
      pushToSlideStack({
        kind: "entity",
        itemId: entityId,
      });
    },
    [pushToSlideStack],
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

  const handleGenerationSettled = useCallback(() => {
    void refetch();
  }, [refetch]);

  const { generations, registerGeneration } = useDashboardItemGenerations({
    onSettled: handleGenerationSettled,
  });

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
      const linkEntityId = link.metadata.recordId.entityId;

      items.push({
        entityId: itemEntityId,
        linkEntityId,
        title: itemProps.name,
        userGoal: itemProps.goal,
        structuralQuery: normalizeStructuralQuery(itemProps.structuralQuery),
        pythonScript: itemProps.pythonScript ?? null,
        chartType: (itemProps.chartType as ChartType | undefined) ?? null,
        chartConfig:
          (itemProps.chartConfiguration as ChartConfig | undefined) ?? null,
        gridPosition: (itemProps.gridPosition as GridPosition | undefined) ?? {
          i: itemEntityId,
          x: 0,
          y: 0,
          w: 6,
          h: 8,
        },
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

  const [archiveEntities] = useMutation<
    ArchiveEntitiesMutation,
    ArchiveEntitiesMutationVariables
  >(archiveEntitiesMutation);

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
    setConfigModalItemEntityId(item.entityId);
    setConfigModalOpen(true);
  }, []);

  const handleItemDeleteClick = useCallback(
    async (item: DashboardItemData) => {
      // Archive both the item entity and the link entity
      await archiveEntities({
        variables: {
          entityIds: [item.entityId, item.linkEntityId],
        },
      });
      await refetch();
    },
    [archiveEntities, refetch],
  );

  const handleDashboardArchive = useCallback(async () => {
    if (!dashboard) {
      throw new Error("Dashboard not loaded");
    }

    const entityIds = new Set<EntityId>([dashboard.entityId]);
    for (const item of dashboard.items) {
      entityIds.add(item.entityId);
      entityIds.add(item.linkEntityId);
    }

    await archiveEntities({
      variables: { entityIds: [...entityIds] },
    });
    await router.push("/dashboards");
  }, [archiveEntities, dashboard, router]);

  const handleTitleOrDescriptionChange = useCallback(
    async (title: string, description: string) => {
      if (!dashboard?.entityId) {
        return;
      }

      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: dashboard.entityId,

            propertyPatches: [
              {
                op: "add",
                path: [blockProtocolPropertyTypes.name.propertyTypeBaseUrl],
                property: {
                  value: title,
                  metadata: {
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  },
                },
              },
              {
                op: "add",
                path: [
                  blockProtocolPropertyTypes.description.propertyTypeBaseUrl,
                ],
                property: {
                  value: description,
                  metadata: {
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  },
                },
              },
            ],
          },
        },
      });
    },
    [dashboard?.entityId, updateEntity],
  );

  /** Open the config modal immediately; the entity is created lazily */
  const handleAddItem = useCallback(() => {
    setSelectedItem(null);
    setConfigModalItemEntityId(null);
    setIsAddingNewItem(true);
    setConfigModalOpen(true);
  }, []);

  /**
   * Create the dashboard item entity and its link to the dashboard. Called
   * by the config modal the first time the new item is persisted (generate
   * or save), so cancelling the modal leaves nothing behind.
   */
  const createItemEntity = useCallback(async (): Promise<EntityId> => {
    if (!dashboard?.entityId) {
      throw new Error("Dashboard not loaded");
    }

    const { data: itemData } = await createEntity({
      variables: {
        entityTypeIds: [systemEntityTypes.dashboardItem.entityTypeId],
        webId: activeWorkspaceWebId,
        properties: mergePropertyObjectAndMetadata<DashboardItemEntity>(
          {
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
              "",
            "https://hash.ai/@h/types/property-type/goal/": "",
            "https://hash.ai/@h/types/property-type/configuration-status/":
              "pending",
            "https://hash.ai/@h/types/property-type/grid-position/": {
              i: `item-${Date.now()}`,
              x: 0,
              y: Infinity, // Place at bottom
              w: 6,
              h: 8,
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
      throw new Error("Failed to create dashboard item");
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

    return newItemEntity.metadata.recordId.entityId;
  }, [dashboard?.entityId, activeWorkspaceWebId, createEntity]);

  const handleCloseConfigModal = useCallback(() => {
    setConfigModalOpen(false);
    setSelectedItem(null);
    setConfigModalItemEntityId(null);
    setIsAddingNewItem(false);
    void refetch();
  }, [refetch]);

  const handleItemGenerationStarted = useCallback(
    (generation: { itemEntityId: EntityId; flowRunId: string }) => {
      setConfigModalItemEntityId(generation.itemEntityId);
      registerGeneration(generation);
      void refetch();
    },
    [refetch, registerGeneration],
  );

  if (loading && !dashboard) {
    return (
      <DashboardContainer
        containerRef={containerRef}
        isFullscreen={isFullscreen}
      >
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
      </DashboardContainer>
    );
  }

  if (!dashboard) {
    return (
      <DashboardContainer
        containerRef={containerRef}
        isFullscreen={isFullscreen}
      >
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
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer containerRef={containerRef} isFullscreen={isFullscreen}>
      <DashboardHeader
        title={dashboard.title}
        description={dashboard.description}
        isEditing={isEditing}
        canEdit={canEdit}
        isFullscreen={isFullscreen}
        onEditToggle={() => setIsEditing(!isEditing)}
        onFullscreenToggle={handleFullscreenToggle}
        onAddItem={handleAddItem}
        onArchive={handleDashboardArchive}
        onTitleOrDescriptionChange={handleTitleOrDescriptionChange}
      />

      <DashboardGrid
        dashboard={dashboard}
        onAddItemClick={handleAddItem}
        onLayoutChange={handleLayoutChange}
        onItemConfigureClick={handleItemConfigureClick}
        onItemDeleteClick={handleItemDeleteClick}
        generations={generations}
        onEntityClick={handleEntityClick}
        hoveredEntityId={hoveredEntityId}
        onHoveredEntityChange={setHoveredEntityId}
        isEditing={isEditing}
        canEdit={canEdit}
      />

      {(selectedItem ?? isAddingNewItem) && activeWorkspaceWebId && (
        <ItemConfigModal
          key={selectedItem?.entityId ?? "new-item"}
          open={configModalOpen}
          onClose={handleCloseConfigModal}
          onGenerationStarted={handleItemGenerationStarted}
          generation={
            configModalItemEntityId
              ? generations[configModalItemEntityId]
              : undefined
          }
          itemEntityId={selectedItem?.entityId ?? null}
          createItemEntity={createItemEntity}
          webId={activeWorkspaceWebId}
          initialGoal={selectedItem?.userGoal}
          initialValues={
            selectedItem
              ? {
                  structuralQuery: selectedItem.structuralQuery,
                  pythonScript: selectedItem.pythonScript,
                  chartType: selectedItem.chartType,
                  chartConfig: selectedItem.chartConfig,
                }
              : undefined
          }
        />
      )}
    </DashboardContainer>
  );
};

DashboardPage.getLayout = (page) =>
  getLayoutWithSidebar(page, { fullWidth: true });

export default DashboardPage;
