import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { type EntityId, splitEntityId } from "@blockprotocol/type-system";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitySubgraphQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";
import type { EntityTraversalPath } from "@rust/hash-graph-store/types";

const traversalPathByDirection = {
  /**
   * Outgoing links (where the entity is the link's left/source) and their
   * right/target entities.
   */
  outgoing: {
    edges: [
      { kind: "has-left-entity", direction: "incoming" },
      { kind: "has-right-entity", direction: "outgoing" },
    ],
  },
  /**
   * Incoming links (where the entity is the link's right/target) and their
   * left/source entities.
   */
  incoming: {
    edges: [
      { kind: "has-right-entity", direction: "incoming" },
      { kind: "has-left-entity", direction: "outgoing" },
    ],
  },
} satisfies Record<"outgoing" | "incoming", EntityTraversalPath>;

/**
 * Fetches the incoming or outgoing links (and their source/target entities and
 * resolved types) for an entity, for display in the readonly link tables.
 *
 * This data used to be fetched as part of the main entity query in
 * `entity.tsx`, but is now fetched by the link tables themselves when they are
 * readonly, so that the main entity query (and the editor shell) does not have
 * to wait on – or grow with – the entity's link data.
 */
export const useEntityLinks = ({
  direction,
  entityId,
  skip = false,
}: {
  direction: "outgoing" | "incoming";
  entityId: EntityId;
  skip?: boolean;
}): {
  loading: boolean;
  linksSubgraph?: Subgraph<EntityRootType<HashEntity>>;
  linkAndDestinationEntitiesClosedMultiEntityTypesMap?: ClosedMultiEntityTypesRootMap;
  closedMultiEntityTypesDefinitions?: ClosedMultiEntityTypesDefinitions;
} => {
  const [webId, entityUuid, draftId] = splitEntityId(entityId);

  const { data, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    skip,
    variables: {
      request: {
        filter: {
          all: [
            {
              equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
            },
            {
              equal: [{ path: ["webId"] }, { parameter: webId }],
            },
            ...(draftId
              ? [
                  {
                    equal: [{ path: ["draftId"] }, { parameter: draftId }],
                  },
                ]
              : []),
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        traversalPaths: [traversalPathByDirection[direction]],
        includeDrafts: !!draftId,
        includeEntityTypes: "resolvedWithDataTypeChildren",
        includePermissions: false,
      },
    },
  });

  return useMemo(() => {
    if (!data) {
      return { loading };
    }

    const { definitions, closedMultiEntityTypes } = data.queryEntitySubgraph;

    return {
      loading,
      linksSubgraph: deserializeQueryEntitySubgraphResponse(
        data.queryEntitySubgraph,
      ).subgraph,
      linkAndDestinationEntitiesClosedMultiEntityTypesMap:
        closedMultiEntityTypes ?? undefined,
      closedMultiEntityTypesDefinitions: definitions ?? undefined,
    };
  }, [data, loading]);
};
