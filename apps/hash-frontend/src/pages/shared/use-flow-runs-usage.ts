import { useQuery } from "@apollo/client";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  AggregatedUsageByTask,
  AggregatedUsageRecord,
} from "@local/hash-isomorphic-utils/service-usage";
import {
  getAggregateUsageRecordsByServiceFeature,
  getAggregateUsageRecordsByTask,
} from "@local/hash-isomorphic-utils/service-usage";
import type { EntityRootType } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import { useHashInstance } from "../../components/hooks/use-hash-instance";
import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";

type UsageByFlowRunId = {
  [flowRunId: EntityUuid]: {
    recordsByTask: AggregatedUsageByTask[];
    recordsByServiceFeature: AggregatedUsageRecord[];
    total: number;
  };
};

export const useFlowRunsUsage = ({
  flowRunIds,
}: {
  flowRunIds: EntityUuid[];
}): {
  isUsageAvailable: boolean;
  loading: boolean;
  usageByFlowRun: UsageByFlowRunId;
} => {
  const { isUserAdmin } = useHashInstance();

  const available = !!(process.env.NEXT_PUBLIC_SHOW_WORKER_COST ?? isUserAdmin);

  const { data, loading } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    pollInterval: 3_000,
    skip: !available,
    fetchPolicy: "network-only",
    variables: {
      request: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.usageRecord.entityTypeId,
              {
                ignoreParents: true,
              },
            ),
            {
              any: flowRunIds.map((flowRunId) => ({
                equal: [
                  { path: ["outgoingLinks", "rightEntity", "uuid"] },
                  { parameter: flowRunId },
                ],
              })),
            },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          // Depths required to retrieve the service the usage record relates to, and the Flow it is associated with
          hasLeftEntity: { incoming: 1, outgoing: 0 },
          hasRightEntity: { incoming: 0, outgoing: 1 },
        },
        includeDrafts: false,
      },
      includePermissions: false,
    },
  });

  const usageByFlowRun = useMemo<UsageByFlowRunId>(() => {
    if (!data) {
      return {};
    }

    const usageByFlowRunId: UsageByFlowRunId = {};

    for (const flowRunId of flowRunIds) {
      const serviceUsageRecordSubgraph =
        mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
          data.getEntitySubgraph.subgraph,
        );

      const usageRecordsForFlowRun = getRoots<EntityRootType>(
        serviceUsageRecordSubgraph,
      ).filter((usageRecord) => {
        const linkedEntities = getOutgoingLinkAndTargetEntities(
          serviceUsageRecordSubgraph,
          usageRecord.metadata.recordId.entityId,
        );

        const incurredInLinkAndEntities = linkedEntities.filter(
          ({ linkEntity }) =>
            linkEntity[0]!.metadata.entityTypeId ===
            systemLinkEntityTypes.incurredIn.linkEntityTypeId,
        );

        if (incurredInLinkAndEntities.length !== 1) {
          throw new Error(
            `Expected exactly one incurredIn link for Flow service usage record ${usageRecord.metadata.recordId.entityId}, got ${incurredInLinkAndEntities.length}.`,
          );
        }

        const incurredInEntity = incurredInLinkAndEntities[0]!.rightEntity[0]!;

        return (
          extractEntityUuidFromEntityId(
            incurredInEntity.metadata.recordId.entityId,
          ) === flowRunId
        );
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

      usageByFlowRunId[flowRunId] = {
        recordsByTask: aggregatedUsageRecordsByTask,
        recordsByServiceFeature: aggregatedUsageRecordsForFlowRun,
        total,
      };
    }

    return usageByFlowRunId;
  }, [data, flowRunIds]);

  return useMemo(
    () => ({
      isUsageAvailable: available,
      loading,
      usageByFlowRun,
    }),
    [available, loading, usageByFlowRun],
  );
};
