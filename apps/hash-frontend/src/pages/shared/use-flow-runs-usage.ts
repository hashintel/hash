import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  getAggregateUsageRecordsByServiceFeature,
  getAggregateUsageRecordsByTask,
} from "@local/hash-isomorphic-utils/service-usage";

import { useHashInstance } from "../../components/hooks/use-hash-instance";
import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";
import type {
  AggregatedUsageByTask,
  AggregatedUsageRecord,
} from "@local/hash-isomorphic-utils/service-usage";
import type { UsageRecord } from "@local/hash-isomorphic-utils/system-types/usagerecord";

type UsageByFlowRunEntityId = Record<
  EntityId,
  {
    recordsByTask: AggregatedUsageByTask[];
    recordsByServiceFeature: AggregatedUsageRecord[];
    total: number;
  }
>;

export const useFlowRunsUsage = ({
  flowRunEntityIds,
  pollInterval = 5_000,
}: {
  flowRunEntityIds: EntityId[];
  pollInterval?: number;
}): {
  isUsageAvailable: boolean;
  loading: boolean;
  usageByFlowRun: UsageByFlowRunEntityId;
} => {
  const { isUserAdmin } = useHashInstance();

  const available = !!(process.env.NEXT_PUBLIC_SHOW_WORKER_COST ?? isUserAdmin);

  const { data, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    pollInterval,
    skip: !available,
    fetchPolicy: "network-only",
    variables: {
      request: {
        filter: {
          all: [
            {
              equal: [
                { path: ["type", "baseUrl"] },
                { parameter: systemEntityTypes.usageRecord.entityTypeBaseUrl },
              ],
            },
            {
              any: flowRunEntityIds.map((flowRunEntityId) => ({
                equal: [
                  { path: ["outgoingLinks", "rightEntity", "uuid"] },
                  { parameter: extractEntityUuidFromEntityId(flowRunEntityId) },
                ],
              })),
            },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        traversalPaths: [
          {
            // Required to retrieve the service the usage record relates to, and the Flow it is associated with
            edges: [
              { kind: "has-left-entity", direction: "incoming" },
              { kind: "has-right-entity", direction: "outgoing" },
            ],
          },
        ],
        includeDrafts: false,
        includePermissions: false,
      },
    },
  });

  const usageByFlowRun = useMemo<UsageByFlowRunEntityId>(() => {
    if (!data) {
      return {};
    }

    const usageByFlowRunEntityId: UsageByFlowRunEntityId = {};

    for (const flowRunEntityId of flowRunEntityIds) {
      const serviceUsageRecordSubgraph =
        deserializeQueryEntitySubgraphResponse<UsageRecord>(
          data.queryEntitySubgraph,
        ).subgraph;

      const usageRecordsForFlowRun = getRoots(
        serviceUsageRecordSubgraph,
      ).filter((usageRecord) => {
        const linkedEntities = getOutgoingLinkAndTargetEntities(
          serviceUsageRecordSubgraph,
          usageRecord.metadata.recordId.entityId,
        );

        const incurredInLinkAndEntities = linkedEntities.filter(
          ({ linkEntity }) =>
            linkEntity[0]!.metadata.entityTypeIds.includes(
              systemLinkEntityTypes.incurredIn.linkEntityTypeId,
            ),
        );

        const [incurredInLinkAndEntity] = incurredInLinkAndEntities;

        if (
          !incurredInLinkAndEntity ||
          incurredInLinkAndEntities.length !== 1
        ) {
          throw new Error(
            `Expected exactly one incurredIn link for Flow service usage record ${usageRecord.metadata.recordId.entityId}, got ${incurredInLinkAndEntities.length}.`,
          );
        }

        const incurredInEntity = incurredInLinkAndEntity.rightEntity?.[0];

        if (!incurredInEntity) {
          return false;
        }

        return incurredInEntity.metadata.recordId.entityId === flowRunEntityId;
      });

      const aggregatedUsageRecordsForFlowRun =
        getAggregateUsageRecordsByServiceFeature({
          serviceUsageRecords: usageRecordsForFlowRun,
          serviceUsageRecordSubgraph,
        });

      const aggregatedUsageRecordsByTask = getAggregateUsageRecordsByTask({
        serviceUsageRecords: usageRecordsForFlowRun,
        serviceUsageRecordSubgraph,
      });

      let total = 0;
      for (const aggregatedUsageRecordForFlowRun of aggregatedUsageRecordsForFlowRun) {
        total += aggregatedUsageRecordForFlowRun.totalCostInUsd;
      }

      usageByFlowRunEntityId[flowRunEntityId] = {
        recordsByTask: aggregatedUsageRecordsByTask,
        recordsByServiceFeature: aggregatedUsageRecordsForFlowRun,
        total,
      };
    }

    return usageByFlowRunEntityId;
  }, [data, flowRunEntityIds]);

  return useMemo(
    () => ({
      isUsageAvailable: available,
      loading,
      usageByFlowRun,
    }),
    [available, loading, usageByFlowRun],
  );
};
