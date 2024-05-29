import { useQuery } from "@apollo/client";
import { Chip, Skeleton, WhiteCard } from "@hashintel/design-system";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { Timestamp } from "@local/hash-graph-types/temporal-versioning";
import {
  fullDecisionTimeAxis,
  fullOntologyResolveDepths,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { DiffEntityInput } from "@local/hash-subgraph";
import { splitEntityId } from "@local/hash-subgraph";
import { useMemo } from "react";

import type {
  GetEntityDiffsQuery,
  GetEntityDiffsQueryVariables,
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../../../../graphql/api-types.gen";
import {
  getEntityDiffsQuery,
  getEntitySubgraphQuery,
} from "../../../../../graphql/queries/knowledge/entity.queries";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { getHistoryEvents } from "./history-section/get-history-events";
import { HistoryTable } from "./history-section/history-table";
import type { HistoryEvent } from "./history-section/shared/types";

export const HistorySection = ({ entityId }: { entityId: EntityId }) => {
  const [ownedById, entityUuid, draftUuid] = splitEntityId(entityId);

  const isDraft = !!draftUuid;

  const { data: editionsData, loading: editionsLoading } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    variables: {
      request: {
        filter: {
          all: [
            {
              equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
            },
            {
              equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
            },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          ...fullOntologyResolveDepths,
        },
        temporalAxes: fullDecisionTimeAxis,
        includeDrafts: isDraft,
      },
      includePermissions: false,
    },
  });

  const diffPairs = useMemo<DiffEntityInput[]>(() => {
    const editions = editionsData?.getEntitySubgraph.subgraph.roots;
    if (!editions) {
      return [];
    }

    const diffInputs: DiffEntityInput[] = [];
    for (const [index, edition] of editions.entries()) {
      const nextEdition = editions[index + 1];
      if (!nextEdition) {
        break;
      }

      diffInputs.push({
        firstEntityId: edition.baseId as EntityId,
        firstDecisionTime: edition.revisionId as Timestamp,
        firstTransactionTime: null,
        secondEntityId: nextEdition.baseId as EntityId,
        secondDecisionTime: nextEdition.revisionId as Timestamp,
        secondTransactionTime: null,
      });
    }
    return diffInputs;
  }, [editionsData]);

  const { data: diffsData, loading: diffsLoading } = useQuery<
    GetEntityDiffsQuery,
    GetEntityDiffsQueryVariables
  >(getEntityDiffsQuery, {
    fetchPolicy: "cache-and-network",
    variables: {
      inputs: diffPairs,
    },
    skip: !diffPairs.length,
  });

  const historyEvents = useMemo<HistoryEvent[]>(() => {
    if (
      editionsLoading ||
      !editionsData ||
      (diffPairs.length > 0 && diffsLoading)
    ) {
      return [];
    }

    const diffs = diffsData?.getEntityDiffs;
    if (!diffs && diffPairs.length > 0) {
      return [];
    }

    const { subgraph } = editionsData.getEntitySubgraph;

    return getHistoryEvents(diffs ?? [], subgraph);
  }, [diffsData, diffsLoading, diffPairs, editionsData, editionsLoading]);

  const subgraph = editionsData?.getEntitySubgraph.subgraph;

  const loading = editionsLoading || diffsLoading;

  return (
    <SectionWrapper
      title="Entity History"
      titleStartContent={
        <Chip
          size="xs"
          label={editionsLoading ? "–" : `${historyEvents.length} events`}
          sx={{ color: ({ palette }) => palette.gray[70] }}
        />
      }
    >
      <WhiteCard sx={{ borderRadius: "10px" }}>
        {loading || !subgraph ? (
          <Skeleton height={600} />
        ) : (
          <HistoryTable events={historyEvents} subgraph={subgraph} />
        )}
      </WhiteCard>
    </SectionWrapper>
  );
};
