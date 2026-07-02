/**
 * A slide that lists the underlying link entities of an aggregated "highway" edge
 * from the graph visualizer.
 *
 * It is given only the link entity ids and, like the entity slide, fetches its own
 * data: a subgraph containing each link entity plus its source and target endpoints.
 * It then feeds that into the same {@link EntitiesTable} used by the entities
 * visualizer, so the table looks and behaves exactly like the entities table users
 * already know -- including the Source and Target columns that link entities
 * populate.
 */
import { useQuery } from "@apollo/client";
import { Box, Container, Stack, Typography, useTheme } from "@mui/material";
import { useCallback, useMemo, useState } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  type BaseUrl,
  type EntityId,
  splitEntityId,
  type VersionedUrl,
} from "@blockprotocol/type-system";
import { LoadingSpinner } from "@hashintel/design-system";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitySubgraphQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";

import { EntitiesTable } from "../entities-visualizer/entities-table";
import { generateTableDataFromRows } from "../entities-visualizer/shared/generate-table-data-from-rows";
import { inSlideContainerStyles } from "../shared/slide-styles";
import { useSlideStack } from "../slide-stack";

import type { ColumnSort } from "../../../components/grid/utils/sorting";
import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../graphql/api-types.gen";
import type {
  EntitiesTableRow,
  SortableEntitiesTableColumnKey,
} from "../entities-visualizer/entities-table-data";
import type { Filter } from "@local/hash-graph-client";

const buildLinkEntityFilter = (linkEntityIds: EntityId[]): Filter => {
  if (linkEntityIds.length === 0) {
    // A filter that matches nothing, so an empty selection returns no rows.
    return { all: [] };
  }

  return {
    any: linkEntityIds.map((entityId) => {
      const [webId, entityUuid, draftId] = splitEntityId(entityId);

      return {
        all: [
          { equal: [{ path: ["webId"] }, { parameter: webId }] },
          { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
          ...(draftId
            ? [{ equal: [{ path: ["draftId"] }, { parameter: draftId }] }]
            : []),
        ],
      };
    }),
  };
};

export const LinkTableSlide = ({
  linkEntityIds,
}: {
  linkEntityIds: EntityId[];
}) => {
  const theme = useTheme();

  const { pushToSlideStack } = useSlideStack();

  const includeDrafts = useMemo(
    () =>
      linkEntityIds.some(
        (entityId) => splitEntityId(entityId)[2] !== undefined,
      ),
    [linkEntityIds],
  );

  const variables = useMemo<QueryEntitySubgraphQueryVariables>(
    () => ({
      request: {
        filter: buildLinkEntityFilter(linkEntityIds),
        // The roots of this query are the link entities themselves, so we resolve
        // their own source (left) and target (right) endpoints. These MUST be two
        // separate single-edge paths: edges within one path are traversed as a
        // chain (link -> left, then left -> its own right), which would never reach
        // the link's target. Two paths each take one hop from the link, pulling in
        // both endpoints so the Source / Target columns resolve.
        traversalPaths: [
          { edges: [{ kind: "has-left-entity", direction: "outgoing" }] },
          { edges: [{ kind: "has-right-entity", direction: "outgoing" }] },
        ],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts,
        includeEntityTypes: "resolvedWithDataTypeChildren",
        includePermissions: false,
      },
    }),
    [includeDrafts, linkEntityIds],
  );

  const { data, error, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    variables,
  });

  // The roots are exactly the requested link entities (the filter matches them);
  // their source/target endpoints come in as non-root vertices via the traversal
  // paths, so they resolve the Source/Target columns without becoming rows.
  const tableData = useMemo(() => {
    const response = data?.queryEntitySubgraph;

    if (!response?.definitions) {
      return null;
    }

    const { subgraph } = deserializeQueryEntitySubgraphResponse(response);

    return generateTableDataFromRows({
      closedMultiEntityTypesRootMap: response.closedMultiEntityTypes ?? {},
      definitions: response.definitions,
      entities: getRoots(subgraph).map((entity) => entity.toJSON()),
      subgraph: response.subgraph,
    });
  }, [data?.queryEntitySubgraph]);

  const handleEntityClick = useCallback(
    (entityId: EntityId) => {
      pushToSlideStack({ kind: "entity", itemId: entityId });
    },
    [pushToSlideStack],
  );

  const handleEntityTypeClick = useCallback(
    ({ entityTypeId }: { entityTypeId: VersionedUrl }) => {
      pushToSlideStack({ kind: "entityType", itemId: entityTypeId });
    },
    [pushToSlideStack],
  );

  // No data-type conversions apply to a fixed set of links; EntitiesTable still
  // requires the setter, so provide a stable no-op.
  const noopSetActiveConversions = useCallback(() => {}, []);

  // EntitiesTable drives sorting and selection from caller-owned state. This
  // slide shows a fixed set of links, so it simply owns that state locally.
  const [sort, setSort] = useState<
    ColumnSort<SortableEntitiesTableColumnKey> & { convertTo?: BaseUrl }
  >({
    columnKey: "entityLabel",
    direction: "asc",
  });

  const [selectedRows, setSelectedRows] = useState<EntitiesTableRow[]>([]);

  const isEmpty = !loading && tableData !== null && tableData.rows.length === 0;
  const formattedLinkCount = linkEntityIds.length.toLocaleString();

  return (
    <Container
      maxWidth={false}
      sx={{
        py: 4,
        ...inSlideContainerStyles,
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 3,
          mb: 2.5,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{ color: ({ palette }) => palette.gray[90], mb: 0.75 }}
          >
            Bundled links
          </Typography>
          <Typography
            variant="smallTextParagraphs"
            sx={{ color: ({ palette }) => palette.gray[70], maxWidth: 640 }}
          >
            Links represented by the selected graph lane. Open any row to
            inspect the link entity and its endpoints.
          </Typography>
        </Box>
        <Stack
          sx={({ palette }) => ({
            alignItems: "flex-end",
            border: `1px solid ${palette.gray[20]}`,
            borderRadius: 1.5,
            bgcolor: palette.gray[10],
            minWidth: 132,
            px: 2,
            py: 1.25,
          })}
        >
          <Typography
            variant="smallTextLabels"
            sx={{ color: ({ palette }) => palette.gray[60] }}
          >
            Represented
          </Typography>
          <Typography
            variant="h5"
            sx={{ color: ({ palette }) => palette.gray[90], lineHeight: 1.1 }}
          >
            {formattedLinkCount}
          </Typography>
        </Stack>
      </Stack>
      {error ? (
        <Stack
          sx={({ palette }) => ({
            border: `1px solid ${palette.red[30]}`,
            borderRadius: 1.5,
            bgcolor: palette.red[10],
            color: palette.red[90],
            p: 2,
          })}
        >
          <Typography variant="smallTextLabels" sx={{ fontWeight: 600 }}>
            Could not load links
          </Typography>
          <Typography variant="smallTextParagraphs" sx={{ mt: 0.75 }}>
            {error.message}
          </Typography>
        </Stack>
      ) : !tableData ? (
        <Stack
          sx={({ palette }) => ({
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${palette.gray[20]}`,
            borderRadius: 1.5,
            bgcolor: palette.common.white,
            minHeight: 360,
            width: "100%",
          })}
        >
          <LoadingSpinner size={42} color={theme.palette.blue[60]} />
        </Stack>
      ) : isEmpty ? (
        <Stack
          sx={({ palette }) => ({
            border: `1px solid ${palette.gray[20]}`,
            borderRadius: 1.5,
            bgcolor: palette.gray[10],
            color: palette.gray[80],
            p: 2,
          })}
        >
          <Typography variant="smallTextLabels" sx={{ fontWeight: 600 }}>
            No links found
          </Typography>
          <Typography variant="smallTextParagraphs" sx={{ mt: 0.75 }}>
            The lane did not resolve to any link entities.
          </Typography>
        </Stack>
      ) : (
        <Box
          sx={({ palette }) => ({
            border: `1px solid ${palette.gray[20]}`,
            borderRadius: 1.5,
            bgcolor: palette.common.white,
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
            overflow: "hidden",
          })}
        >
          <EntitiesTable
            activeConversions={null}
            csvFileTitle="Links"
            handleEntityClick={handleEntityClick}
            hasMoreRowsAvailable={false}
            loading={loading}
            isViewingOnlyPages={false}
            maxHeight="calc(100vh - 220px)"
            selectedRows={selectedRows}
            setActiveConversions={noopSetActiveConversions}
            setSelectedEntityType={handleEntityTypeClick}
            setSelectedRows={setSelectedRows}
            sort={sort}
            setSort={setSort}
            tableData={tableData}
            totalResultCount={tableData.rows.length}
          />
        </Box>
      )}
    </Container>
  );
};
