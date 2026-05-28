import { useQuery } from "@apollo/client";
import { useCallback, useMemo } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { splitEntityId } from "@blockprotocol/type-system";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { fullDecisionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";
import type { SDCPN } from "@hashintel/petrinaut";
import type { PetriNet } from "@local/hash-isomorphic-utils/system-types/petrinet";

/**
 * One past revision of a persisted Petri net entity. Index 0 in the
 * returned array is the most recent; the last entry is the oldest.
 */
export type PetriNetRevision = {
  /**
   * ISO timestamp at which this revision started being the truth.
   * Doubles as a stable key for React lists and the "decision-time"
   * coordinate for downstream queries.
   */
  decisionTime: string;
  title: string;
  definition: SDCPN;
};

/**
 * Fetches every revision of a single Petri net entity.
 */
export const usePetriNetRevisions = (
  entityId: EntityId | null,
): {
  revisions: PetriNetRevision[];
  refetch: () => Promise<unknown>;
} => {
  const [webId, entityUuid] = entityId
    ? splitEntityId(entityId)
    : [undefined, undefined];

  const { data, refetch: rawRefetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    skip: !entityId,
    variables: {
      request: {
        filter: {
          all: [
            { equal: [{ path: ["uuid"] }, { parameter: entityUuid ?? "" }] },
            { equal: [{ path: ["webId"] }, { parameter: webId ?? "" }] },
          ],
        },
        traversalPaths: [],
        includeDrafts: true,
        temporalAxes: fullDecisionTimeAxis,
        includePermissions: false,
      },
    },
  });

  const refetch = useCallback(async () => {
    if (!entityId) {
      /**
       * Apollo's `refetch()` bypasses `skip` and reuses whatever variables
       * the query was set up with — for an unsaved net those are empty
       * strings, which the graph rejects with "could not convert '' to UUID".
       */
      return;
    }
    await rawRefetch();
  }, [entityId, rawRefetch]);

  const revisions = useMemo<PetriNetRevision[]>(() => {
    if (!data) {
      return [];
    }

    const subgraph = deserializeQueryEntitySubgraphResponse<PetriNet>(
      data.queryEntitySubgraph,
    ).subgraph;

    return getRoots(subgraph)
      .map((edition): PetriNetRevision => {
        const title =
          edition.properties["https://hash.ai/@h/types/property-type/title/"];

        const definition = edition.properties[
          "https://hash.ai/@h/types/property-type/definition-object/"
        ] as SDCPN;

        return {
          decisionTime:
            edition.metadata.temporalVersioning.decisionTime.start.limit,
          title,
          definition,
        };
      })
      .sort((a, b) => (a.decisionTime < b.decisionTime ? 1 : -1));
  }, [data]);

  return { revisions, refetch };
};
