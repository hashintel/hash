import { getLatestEntityVertices } from "@blockprotocol/graph/stdlib";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateEntityIdFilter,
} from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitySubgraphQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { apolloClient } from "../../../lib/apollo-client";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";
import type { TraversalPath } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

/**
 * Resolve the links into and out of the expanded nodes so their endpoints come back too and
 * become the next frontier (left/right entity edges, both directions).
 */
const frontierTraversalPaths: TraversalPath[] = [
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
 * The neighbourhood of an expanded frontier set: the fetched entities plus the type data the
 * caller needs to register them. The entities' ids are the new roots; the rest of the
 * neighbourhood is the next frontier.
 */
export interface FrontierExpansion {
  entities: HashEntity[];
  closedMultiEntityTypes: QueryEntitySubgraphQuery["queryEntitySubgraph"]["closedMultiEntityTypes"];
  definitions: QueryEntitySubgraphQuery["queryEntitySubgraph"]["definitions"];
}

/**
 * Imperatively fetch the neighbourhood of a set of frontier nodes, to feed the worker's additive
 * ingest (the whole point of incremental loading). Deliberately a plain async function, not a
 * reactive hook: it has no React-state dependencies, and a reactive query here would fight the
 * additive model. Each id is rooted via {@link generateEntityIdFilter}, so every expanded node
 * brings its links + endpoints.
 */
export async function fetchFrontierExpansion(
  entityIds: readonly EntityId[],
): Promise<FrontierExpansion | undefined> {
  if (entityIds.length === 0) {
    return undefined;
  }

  const { data: expansion } = await apolloClient.query<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >({
    query: queryEntitySubgraphQuery,
    fetchPolicy: "network-only",
    variables: {
      request: {
        filter: {
          any: entityIds.map((entityId) =>
            generateEntityIdFilter({ entityId, includeArchived: false }),
          ),
        },
        traversalPaths: frontierTraversalPaths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includeEntityTypes: "resolvedWithDataTypeChildren",
        includePermissions: false,
      },
    },
  });

  const expandedSubgraph = deserializeQueryEntitySubgraphResponse(
    expansion.queryEntitySubgraph,
  ).subgraph;

  return {
    entities: getLatestEntityVertices(expandedSubgraph).map(
      (vertex) => vertex.inner,
    ),
    closedMultiEntityTypes:
      expansion.queryEntitySubgraph.closedMultiEntityTypes,
    definitions: expansion.queryEntitySubgraph.definitions,
  };
}
