import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";

import type { GraphApi } from "@local/hash-graph-client";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type {
  QueryEntitySubgraphRequest,
  QueryEntitySubgraphResponse,
} from "@local/hash-graph-sdk/entity";

type EntitySubgraph = QueryEntitySubgraphResponse["subgraph"];

const mergeRecordRevisions = <Value>(
  accumulated: Record<string, Record<string, Value>>,
  page: Record<string, Record<string, Value>>,
): Record<string, Record<string, Value>> => {
  const merged = { ...accumulated };

  for (const [baseId, revisions] of Object.entries(page)) {
    merged[baseId] = { ...(merged[baseId] ?? {}), ...revisions };
  }

  return merged;
};

const mergeSubgraphs = (
  accumulated: EntitySubgraph,
  page: EntitySubgraph,
): EntitySubgraph => ({
  ...accumulated,
  roots: [...accumulated.roots, ...page.roots],
  vertices: mergeRecordRevisions(
    accumulated.vertices as Record<string, Record<string, unknown>>,
    page.vertices as Record<string, Record<string, unknown>>,
  ) as EntitySubgraph["vertices"],
  edges: mergeRecordRevisions(
    accumulated.edges as Record<string, Record<string, unknown>>,
    page.edges as Record<string, Record<string, unknown>>,
  ) as EntitySubgraph["edges"],
});

/**
 * Query every page of an entity subgraph request and merge the page graphs.
 *
 * Pagination applies to roots, while traversed vertices can be repeated across
 * pages. Vertex and edge revisions are therefore merged by base and revision
 * identifiers rather than concatenated.
 */
export const queryAllEntitySubgraphPages = async (
  context: { graphApi: GraphApi },
  authentication: AuthenticationContext,
  request: QueryEntitySubgraphRequest,
): Promise<EntitySubgraph> => {
  let cursor = request.cursor;
  let accumulatedSubgraph: EntitySubgraph | undefined;

  do {
    const response = await queryEntitySubgraph(context, authentication, {
      ...request,
      cursor,
    });

    accumulatedSubgraph = accumulatedSubgraph
      ? mergeSubgraphs(accumulatedSubgraph, response.subgraph)
      : response.subgraph;
    cursor = response.cursor;
  } while (cursor);

  return accumulatedSubgraph;
};
