import { useQuery } from "@apollo/client";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { SDCPN } from "@hashintel/petrinaut";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { PetriNet } from "@local/hash-isomorphic-utils/system-types/petrinet";
import { useMemo } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import type { PersistedNet } from "../use-process-save-and-load";

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

    return {
      entityId: net.entityId,
      title: netTitle,
      definition,
      userEditable,
    };
  });
};

export const usePersistedNets = () => {
  const { data, refetch } = useQuery<
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
    refetch,
  };
};
