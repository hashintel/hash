import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  type Simplified,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";

import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import type { ApolloError } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import type { EntityId, EntityUuid } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ScheduleSpec } from "@local/hash-isomorphic-utils/flows/schedule-types";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/flowschedule";

type UseFlowSchedulesResult = {
  loading: boolean;
  error: ApolloError | undefined;
  refetch: () => Promise<unknown>;
  /** Whether the schedules have been fetched, so an empty map means there are none. */
  loaded: boolean;
  schedulesByEntityUuid: Map<EntityUuid, Simplified<HashEntity<FlowSchedule>>>;
};

const formatIntervalMs = (ms: number): string => {
  const minutes = ms / (60 * 1000);
  if (minutes < 60) {
    return `Every ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return `Every ${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  const days = hours / 24;
  return `Every ${days} day${days !== 1 ? "s" : ""}`;
};

/** When a schedule runs, in words, e.g. "Every 10 minutes". */
export const formatScheduleSpec = (scheduleSpec: ScheduleSpec): string =>
  scheduleSpec.type === "interval"
    ? formatIntervalMs(scheduleSpec.intervalMs)
    : `Cron: ${scheduleSpec.cronExpression}`;

/**
 * Hook to fetch the flow schedules visible to the current user: all of them, or only those of one flow.
 */
export const useFlowSchedules = ({
  flowDefinitionEntityId,
}: {
  /** The flow whose schedules to fetch, if only one flow's. */
  flowDefinitionEntityId?: EntityId;
} = {}): UseFlowSchedulesResult => {
  const { data, loading, error, refetch } = useQuery<
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
            ...(flowDefinitionEntityId
              ? [
                  /* A schedule `Uses` the flow it runs. */
                  {
                    equal: [
                      { path: ["outgoingLinks", "rightEntity", "uuid"] },
                      {
                        parameter: extractEntityUuidFromEntityId(
                          flowDefinitionEntityId,
                        ),
                      },
                    ],
                  },
                ]
              : []),
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
    error,
    refetch,
    loaded: data !== undefined,
    schedulesByEntityUuid,
  };
};
