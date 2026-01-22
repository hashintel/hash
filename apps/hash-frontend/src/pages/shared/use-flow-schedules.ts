import { useQuery } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { EntityUuid } from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system/dist/es-slim/native";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  type Simplified,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/shared";
import { useMemo } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";

type UseFlowSchedulesResult = {
  loading: boolean;
  refetch: () => Promise<unknown>;
  schedulesByEntityUuid: Map<EntityUuid, Simplified<HashEntity<FlowSchedule>>>;
};

/**
 * Hook to fetch all flow schedules visible to the current user.
 */
export const useFlowSchedules = (): UseFlowSchedulesResult => {
  const { data, loading, refetch } = useQuery<
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
                { parameter: systemEntityTypes.flowSchedule.entityTypeId },
              ],
            },
            {
              equal: [{ path: ["archived"] }, { parameter: false }],
            },
          ],
        },
        graphResolveDepths: {
          constrainsValuesOn: 0,
          constrainsPropertiesOn: 0,
          constrainsLinksOn: 0,
          constrainsLinkDestinationsOn: 0,
          inheritsFrom: 0,
          isOfType: false,
        },
        traversalPaths: [],
        temporalAxes: {
          pinned: {
            axis: "transactionTime",
            timestamp: null,
          },
          variable: {
            axis: "decisionTime",
            interval: {
              start: null,
              end: null,
            },
          },
        },
        includeDrafts: false,
        includePermissions: false,
      },
    },
    pollInterval: 10_000,
    fetchPolicy: "cache-and-network",
  });

  const schedulesByEntityUuid = useMemo<
    Map<EntityUuid, Simplified<HashEntity<FlowSchedule>>>
  >(() => {
    if (!data) {
      return new Map();
    }

    const subgraph = deserializeSubgraph<
      EntityRootType<HashEntity<FlowSchedule>>
    >(data.queryEntitySubgraph.subgraph);

    const entities = getRoots(subgraph);
    const byUuid = new Map<EntityUuid, Simplified<HashEntity<FlowSchedule>>>();

    for (const entity of entities) {
      const entityId = entity.metadata.recordId.entityId;
      const scheduleEntityUuid = extractEntityUuidFromEntityId(entityId);

      const schedule: Simplified<HashEntity<FlowSchedule>> = {
        metadata: entity.metadata,
        properties: simplifyProperties(entity.properties),
      };

      byUuid.set(scheduleEntityUuid, schedule);
    }

    return byUuid;
  }, [data]);

  return {
    loading,
    refetch,
    schedulesByEntityUuid,
  };
};
