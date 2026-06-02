import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";
import type { SDCPN } from "@hashintel/petrinaut";
import type { PetriNet } from "@local/hash-isomorphic-utils/system-types/petrinet";

/**
 * One persisted Petri net entity, flattened for use by the list page and the
 * editor's save/load logic.
 */
export type PersistedNet = {
  entityId: EntityId;
  title: string;
  definition: SDCPN;
  userEditable: boolean;
  lastUpdated: string;
};

export const getPersistedNetsFromSubgraph = (
  data: QueryEntitySubgraphQuery,
): PersistedNet[] => {
  const subgraph = deserializeQueryEntitySubgraphResponse<PetriNet>(
    data.queryEntitySubgraph,
  ).subgraph;

  const nets = getRoots(subgraph);

  return nets.map((net) => {
    const netTitle =
      net.properties["https://hash.ai/@h/types/property-type/title/"];

    const rawDefinition =
      net.properties[
        "https://hash.ai/@h/types/property-type/definition-object/"
      ];

    const definition = rawDefinition as SDCPN;

    const userEditable =
      !!data.queryEntitySubgraph.entityPermissions?.[net.entityId]?.update;

    const lastUpdated =
      net.metadata.temporalVersioning.decisionTime.start.limit;

    return {
      entityId: net.entityId,
      title: netTitle,
      definition,
      userEditable,
      lastUpdated,
    };
  });
};

/**
 * Fetch the persisted Petri net entities visible to the current user.
 *
 * Used both by the `/processes` list page (to render tiles) and by the editor
 * (to resolve a URL uuid back to the full entity record).
 */
export const usePersistedNets = () => {
  const { data, loading, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          equal: [
            {
              path: ["type", "versionedUrl"],
            },
            {
              parameter: systemEntityTypes.petriNet.entityTypeId,
            },
          ],
        },
        traversalPaths: [],
        includeDrafts: false,
        temporalAxes: currentTimeInstantTemporalAxes,
        includePermissions: true,
      },
    },
  });

  const persistedNets = useMemo(() => {
    if (!data) {
      return [];
    }

    return getPersistedNetsFromSubgraph(data);
  }, [data]);

  return {
    persistedNets,
    loading,
    refetch,
  };
};
