import { useMutation, useQuery } from "@apollo/client";
import { Add as AddIcon } from "@mui/icons-material";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Container,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";

import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { TextField } from "@hashintel/design-system";
import {
  deserializeQueryEntitySubgraphResponse,
  HashEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import { chartTypes } from "@local/hash-isomorphic-utils/dashboard-types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { useGetOwnerForEntity } from "../components/hooks/use-get-owner-for-entity";
import {
  createEntityMutation,
  queryEntitySubgraphQuery,
} from "../graphql/queries/knowledge/entity.queries";
import { getLayoutWithSidebar } from "../shared/layout";
import { Button } from "../shared/ui/button";
import { Modal } from "../shared/ui/modal";
import {
  DashboardPreview,
  type DashboardPreviewItem,
} from "./dashboards.page/dashboard-preview";
import { useActiveWorkspace } from "./shared/workspace-context";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../graphql/api-types.gen";
import type { NextPageWithLayout } from "../shared/layout";
import type { EntityId } from "@blockprotocol/type-system";
import type {
  ChartType,
  GridPosition,
} from "@local/hash-isomorphic-utils/dashboard-types";
import type {
  Dashboard,
  DashboardProperties,
} from "@local/hash-isomorphic-utils/system-types/dashboard";
import type { DashboardItem } from "@local/hash-isomorphic-utils/system-types/dashboarditem";

type DashboardListItem = {
  entityId: EntityId;
  title: string;
  description?: string;
  itemCount: number;
  previewItems: DashboardPreviewItem[];
  webShortname?: string;
};

const DashboardsPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { activeWorkspaceWebId } = useActiveWorkspace();
  const getOwnerForEntity = useGetOwnerForEntity();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newDashboardTitle, setNewDashboardTitle] = useState("");
  const [newDashboardDescription, setNewDashboardDescription] = useState("");

  const { data: dashboardsData, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          all: [
            {
              equal: [
                { path: ["type", "versionedUrl"] },
                { parameter: systemEntityTypes.dashboard.entityTypeId },
              ],
            },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
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
        includePermissions: false,
      },
    },
    fetchPolicy: "cache-and-network",
  });

  const dashboards = useMemo<DashboardListItem[]>(() => {
    if (!dashboardsData) {
      return [];
    }

    const { subgraph } = deserializeQueryEntitySubgraphResponse<Dashboard>(
      dashboardsData.queryEntitySubgraph,
    );

    const dashboardEntities = getRoots(subgraph);

    return dashboardEntities.map((entity) => {
      const { name, description } = simplifyProperties(entity.properties);

      const outgoingLinks = getOutgoingLinkAndTargetEntities(
        subgraph,
        entity.metadata.recordId.entityId,
      );

      const previewItems: DashboardPreviewItem[] = [];
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
          | HashEntity<DashboardItem>
          | undefined;
        if (!itemEntity) {
          continue;
        }

        const itemProperties = simplifyProperties(itemEntity.properties);
        const chartType = itemProperties.chartType as ChartType | undefined;
        previewItems.push({
          entityId: itemEntity.metadata.recordId.entityId,
          chartType:
            chartType && chartTypes.includes(chartType) ? chartType : null,
          gridPosition: (itemProperties.gridPosition as
            | GridPosition
            | undefined) ?? {
            i: itemEntity.metadata.recordId.entityId,
            x: 0,
            y: Number.POSITIVE_INFINITY,
            w: 6,
            h: 8,
          },
        });
      }

      return {
        entityId: entity.metadata.recordId.entityId,
        title: name,
        description,
        itemCount: previewItems.length,
        previewItems,
        webShortname:
          getOwnerForEntity({
            entityId: entity.metadata.recordId.entityId,
          }).shortname || undefined,
      };
    });
  }, [dashboardsData, getOwnerForEntity]);

  const [createEntity, { loading: creating }] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation, {
    refetchQueries: [queryEntitySubgraphQuery],
  });

  const handleCreateDashboard = useCallback(async () => {
    if (!activeWorkspaceWebId || !newDashboardTitle.trim()) {
      return;
    }

    const properties: DashboardProperties = {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
        newDashboardTitle.trim(),
      ...(newDashboardDescription.trim() && {
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          newDashboardDescription.trim(),
      }),
    };

    const { data } = await createEntity({
      variables: {
        entityTypeIds: [systemEntityTypes.dashboard.entityTypeId],
        webId: activeWorkspaceWebId,
        properties: mergePropertyObjectAndMetadata<Dashboard>(
          properties,
          undefined,
        ),
      },
    });

    const createdEntity = data?.createEntity
      ? new HashEntity(data.createEntity)
      : null;

    if (createdEntity) {
      const entityUuid = extractEntityUuidFromEntityId(
        createdEntity.metadata.recordId.entityId,
      );
      setCreateDialogOpen(false);
      setNewDashboardTitle("");
      setNewDashboardDescription("");
      void router.push(`/dashboard/${entityUuid}`);
    }
  }, [
    activeWorkspaceWebId,
    newDashboardTitle,
    newDashboardDescription,
    createEntity,
    router,
  ]);

  const handleDashboardClick = (entityId: EntityId) => {
    const entityUuid = extractEntityUuidFromEntityId(entityId);
    void router.push(`/dashboard/${entityUuid}`);
  };

  return (
    <Container sx={{ py: 8 }}>
      <Box
        sx={{
          mb: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h1">Dashboards</Typography>
        {dashboards.length > 0 && (
          <Button
            variant="primary"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Dashboard
          </Button>
        )}
      </Box>

      {loading && dashboards.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {dashboards.map((dashboard) => (
            <Grid
              item
              xs={12}
              sm={6}
              md={4}
              key={dashboard.entityId}
              sx={{ display: "flex" }}
            >
              <Card sx={{ width: "100%", height: "100%" }}>
                <CardActionArea
                  onClick={() => handleDashboardClick(dashboard.entityId)}
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                  }}
                >
                  <DashboardPreview items={dashboard.previewItems} />
                  <CardContent
                    sx={{
                      minHeight: 140,
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <Typography variant="h5" gutterBottom>
                      {dashboard.title}
                    </Typography>
                    {dashboard.description && (
                      <Typography
                        variant="smallTextParagraphs"
                        sx={{
                          display: "-webkit-box",
                          overflow: "hidden",
                          color: ({ palette }) => palette.gray[70],
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 3,
                        }}
                      >
                        {dashboard.description}
                      </Typography>
                    )}
                    <Typography
                      variant="microText"
                      sx={{
                        mt: "auto",
                        pt: 2,
                        display: "block",
                        color: ({ palette }) => palette.gray[70],
                      }}
                    >
                      <Box component="span" sx={{ fontWeight: 600 }}>
                        {dashboard.webShortname
                          ? `@${dashboard.webShortname} · `
                          : ""}
                      </Box>
                      {dashboard.itemCount} item
                      {dashboard.itemCount !== 1 ? "s" : ""}
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
                <Typography
                  variant="h5"
                  sx={{ color: ({ palette }) => palette.gray[70] }}
                  gutterBottom
                >
                  No dashboards yet
                </Typography>
                <Typography
                  variant="smallTextParagraphs"
                  sx={{ mb: 3, color: ({ palette }) => palette.gray[70] }}
                >
                  Create your first dashboard to start visualizing your data
                </Typography>
                <Box mt={3}>
                  <Button
                    variant="primary"
                    startIcon={<AddIcon />}
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    Create Dashboard
                  </Button>
                </Box>
              </Box>
            </Grid>
          )}
        </Grid>
      )}

      {/* Create Dashboard Modal */}
      <Modal
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        header={{ title: "Create New Dashboard", hideCloseButton: true }}
        contentStyle={{ maxWidth: 800 }}
      >
        <Box>
          <TextField
            autoFocus
            margin="dense"
            label="Dashboard Title"
            fullWidth
            value={newDashboardTitle}
            onChange={(event) => setNewDashboardTitle(event.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Description (optional)"
            fullWidth
            multiline
            rows={3}
            value={newDashboardDescription}
            onChange={(event) => setNewDashboardDescription(event.target.value)}
          />
          <Stack
            direction="row"
            spacing={1.5}
            justifyContent="flex-end"
            sx={{ mt: 3 }}
          >
            <Button
              variant="primary"
              onClick={handleCreateDashboard}
              disabled={creating || !newDashboardTitle.trim()}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
            <Button
              variant="tertiary"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
          </Stack>
        </Box>
      </Modal>
    </Container>
  );
};

DashboardsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, { fullWidth: true });

export default DashboardsPage;
