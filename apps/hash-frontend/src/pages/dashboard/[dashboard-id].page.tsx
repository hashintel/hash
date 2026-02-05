import { useMutation, useQuery } from "@apollo/client";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type { EntityId, EntityUuid } from "@blockprotocol/type-system";
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
import {
  currentTimeInstantTemporalAxes,
  zeroedOntologyResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { Dashboard } from "@local/hash-isomorphic-utils/system-types/dashboard";
import type { DashboardItem as DashboardItemEntity } from "@local/hash-isomorphic-utils/system-types/dashboarditem";
import { Box, CircularProgress, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import {
  archiveEntitiesMutation,
  createEntityMutation,
  queryEntitySubgraphQuery,
  updateEntityMutation,
} from "../../graphql/queries/knowledge/entity.queries";
import type { NextPageWithLayout } from "../../shared/layout";
import { getLayoutWithSidebar } from "../../shared/layout";
import { useSlideStack } from "../shared/slide-stack";
import { useActiveWorkspace } from "../shared/workspace-context";
import { DashboardGrid } from "./[dashboard-id].page/dashboard-grid";
import { DashboardHeader } from "./[dashboard-id].page/dashboard-header";
import { processVerticesIntoFlights } from "./[dashboard-id].page/dummy-data";
import { generateDashboardItems } from "./[dashboard-id].page/generate-dashboard-items";
import { ItemConfigModal } from "./[dashboard-id].page/item-config-modal";
import type { DashboardData, DashboardItemData } from "./shared/types";

type DashboardContainerProps = {
  children: React.ReactNode;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
};

const DashboardContainer = ({
  children,
  containerRef,
  isFullscreen,
}: DashboardContainerProps) => {
  return (
    <Container
      ref={containerRef}
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  const { data: flightGraphData, loading: flightGraphLoading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          equal: [
            { path: ["type", "versionedUrl"] },
            { parameter: systemEntityTypes.flight.entityTypeId },
          ],
        },
        graphResolveDepths: zeroedOntologyResolveDepths,
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
        includePermissions: false,
      },
    },
    fetchPolicy: "cache-and-network",
  });

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

    // const items: DashboardItemData[] = [];

    // for (const { linkEntity, rightEntity } of outgoingLinks) {
    //   const link = linkEntity[0];
    //   if (
    //     !link?.metadata.entityTypeIds.includes(
    //       systemLinkEntityTypes.has.linkEntityTypeId,
    //     )
    //   ) {
    //     continue;
    //   }

    //   const itemEntity = rightEntity[0] as
    //     | HashEntity<DashboardItemEntity>
    //     | undefined;

    //   if (!itemEntity) {
    //     continue;
    //   }

    //   const itemProps = simplifyProperties(itemEntity.properties);
    //   const itemEntityId = itemEntity.metadata.recordId.entityId;
    //   const linkEntityId = link.metadata.recordId.entityId;

    //   items.push({
    //     entityId: itemEntityId,
    //     linkEntityId,
    //     title: itemProps.name,
    //     userGoal: itemProps.goal,
    //     chartType: itemProps.chartType as ChartType,
    //     chartData: null, // Chart data is computed at runtime
    //     chartConfig: itemProps.chartConfiguration as ChartConfig,
    //     gridPosition: itemProps.gridPosition as GridPosition,
    //     configurationStatus:
    //       itemProps.configurationStatus as DashboardItemData["configurationStatus"],
    //   });
    // }

    // Process flight data from API and generate dashboard items
    const flightVertices = flightGraphData?.queryEntitySubgraph.subgraph
      .vertices as
      | Record<string, Record<string, { kind: string; inner: unknown }>>
      | undefined;
    const flightsWithLinksResolved = flightVertices
      ? processVerticesIntoFlights(flightVertices)
      : [];
    const items: DashboardItemData[] = generateDashboardItems(
      flightsWithLinksResolved,
    );

    return {
      entityId: dashboardEntity.metadata.recordId.entityId,
      title: name,
      description,
      gridLayout: gridLayout as DashboardGridLayout,
      items,
    };
  }, [dashboardData, flightGraphData]);

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
    setConfigModalOpen(true);
  }, []);

  const handleItemRefreshClick = useCallback(async () => {
    await refetch();
  }, [refetch]);

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
    [],
  );

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
              "",
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

    const { data: linkData } = await createEntity({
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

    const newLinkEntity = linkData?.createEntity
      ? new HashEntity(linkData.createEntity)
      : null;

    // Refetch and open the config modal for the new item
    await refetch();

    setSelectedItem({
      entityId: newItemEntity.metadata.recordId.entityId,
      // Link entity ID will be available after refetch; use item ID as placeholder
      linkEntityId:
        newLinkEntity?.metadata.recordId.entityId ??
        newItemEntity.metadata.recordId.entityId,
      title: "",
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
        onTitleOrDescriptionChange={handleTitleOrDescriptionChange}
      />

      <DashboardGrid
        dashboard={dashboard}
        onAddItemClick={handleAddItem}
        onLayoutChange={handleLayoutChange}
        onItemConfigureClick={handleItemConfigureClick}
        onItemRefreshClick={handleItemRefreshClick}
        onItemDeleteClick={handleItemDeleteClick}
        onEntityClick={handleEntityClick}
        isEditing={isEditing}
        canEdit={canEdit}
        isDataLoading={flightGraphLoading}
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
    </DashboardContainer>
  );
};

DashboardPage.getLayout = (page) =>
  getLayoutWithSidebar(page, { fullWidth: true });

export default DashboardPage;
