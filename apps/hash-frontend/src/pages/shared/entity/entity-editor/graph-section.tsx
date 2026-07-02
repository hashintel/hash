import { useQuery } from "@apollo/client";
import { Box, useTheme } from "@mui/material";
import { useCallback, useMemo } from "react";

import { getLatestEntityVertices, getRoots } from "@blockprotocol/graph/stdlib";
import { type EntityId, splitEntityId } from "@blockprotocol/type-system";
import { LoadingSpinner } from "@hashintel/design-system";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { useOwnedFrontierStore } from "../../graph-visualizer/components/use-frontier-expansion";
import { EntityGraphVisualizer } from "../../graph-visualizer/entity-graph-visualizer";
import { useSlideStack, useSlideStackOcclusion } from "../../slide-stack";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { TraversalPath } from "@local/hash-graph-client";

/**
 * Resolve the links into and out of the seed entity so its immediate neighbours come back as
 * FRONTIER nodes (greyed-out until the user expands them). Mirrors the Graph view's traversal in
 * the entities visualizer: both link directions, one hop.
 */
const graphViewTraversalPaths: TraversalPath[] = [
  {
    edges: [
      { kind: "has-left-entity", direction: "incoming" },
      { kind: "has-right-entity", direction: "outgoing" },
    ],
  },
  {
    edges: [
      { kind: "has-right-entity", direction: "incoming" },
      { kind: "has-left-entity", direction: "outgoing" },
    ],
  },
];

/**
 * Embeds the graph visualizer (v2) seeded with a single entity -- the one being viewed. The seed is
 * the only query ROOT; its one-hop link endpoints come back as FRONTIER nodes the user can expand
 * from to explore outwards.
 */
export const GraphSection = ({ entityId }: { entityId: EntityId }) => {
  const theme = useTheme();
  const { pushToSlideStack } = useSlideStack();
  // Pause the simulation while this editor's slide is covered by a later
  // slide (or, on a full page, while any slide is open over it).
  const occluded = useSlideStackOcclusion();
  // Expansions extend this seed entity's neighbourhood; a different seed is
  // a different graph, so the store resets with the entity id.
  const frontierStore = useOwnedFrontierStore(entityId);

  const [webId, entityUuid] = splitEntityId(entityId);

  const { data, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    variables: {
      request: {
        filter: {
          all: [
            { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
            { equal: [{ path: ["webId"] }, { parameter: webId }] },
          ],
        },
        traversalPaths: graphViewTraversalPaths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includeEntityTypes: "resolvedWithDataTypeChildren",
        includePermissions: false,
      },
    },
  });

  const subgraph = useMemo(
    () =>
      data?.queryEntitySubgraph
        ? deserializeQueryEntitySubgraphResponse(data.queryEntitySubgraph)
            .subgraph
        : undefined,
    [data?.queryEntitySubgraph],
  );

  const entities = useMemo(
    () =>
      subgraph
        ? getLatestEntityVertices(subgraph).map((vertex) => vertex.inner)
        : undefined,
    [subgraph],
  );

  /**
   * The seed is the only root; every other fetched entity (its link endpoints) is a frontier node.
   * Deriving the root id from the subgraph (rather than reusing the page's `entityId`) keeps it
   * matched to the fetched live entity regardless of any draft id on the page.
   */
  const rootEntityIds = useMemo(
    () =>
      subgraph
        ? getRoots(subgraph).map((entity) => entity.metadata.recordId.entityId)
        : undefined,
    [subgraph],
  );

  const handleEntityClick = useCallback(
    (clickedEntityId: EntityId) => {
      pushToSlideStack({ kind: "entity", itemId: clickedEntityId });
    },
    [pushToSlideStack],
  );

  const handleOpenLinkTable = useCallback(
    (linkEntityIds: readonly EntityId[]) => {
      pushToSlideStack({
        kind: "linkTable",
        itemId: `linkTable:${linkEntityIds[0] ?? "empty"}:${
          linkEntityIds.length
        }`,
        linkEntityIds: [...linkEntityIds],
      });
    },
    [pushToSlideStack],
  );

  return (
    <Box
      sx={({ palette }) => ({
        position: "relative",
        height: "min(calc(100vh - 320px), 900px)",
        minHeight: 500,
        border: 1,
        borderColor: palette.gray[20],
        borderRadius: "10px",
        overflow: "hidden",
        background: palette.common.white,
      })}
    >
      {loading && !subgraph ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
          <LoadingSpinner size={42} color={theme.palette.blue[60]} />
        </Box>
      ) : (
        <EntityGraphVisualizer
          entities={entities}
          rootEntityIds={rootEntityIds}
          sourceKey={entityId}
          occluded={occluded}
          frontierStore={frontierStore}
          closedMultiEntityTypesRootMap={
            data?.queryEntitySubgraph.closedMultiEntityTypes
          }
          definitions={data?.queryEntitySubgraph.definitions}
          loadingComponent={
            <LoadingSpinner size={42} color={theme.palette.blue[60]} />
          }
          onEntityClick={handleEntityClick}
          onOpenLinkTable={handleOpenLinkTable}
        />
      )}
    </Box>
  );
};
