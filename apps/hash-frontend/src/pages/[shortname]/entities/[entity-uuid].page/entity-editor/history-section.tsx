import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { Chip, Skeleton, WhiteCard } from "@hashintel/design-system";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { Timestamp } from "@local/hash-graph-types/temporal-versioning";
import {
  fullDecisionTimeAxis,
  fullOntologyResolveDepths,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { DiffEntityInput , splitEntityId } from "@local/hash-subgraph";

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
  const [ownedById, entityUuid, _draftUuid] = splitEntityId(entityId);

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
        includeDrafts: true,
      },
      includePermissions: false,
    },
  });

  const diffPairs = useMemo<DiffEntityInput[]>(() => {
    if (!editionsData) {
      return [];
    }

    /**
     * @todo H-3031: the history may contain draft editions which are not relevant to constructing the history
     *   of the entity, either because
     *   (1) they were competing past drafts that were not taken forward into the live series, or
     *   (2) because they are a draft created from a live edition that we are looking at (and are therefore 'future')
     *   Once back references from live editions to drafts they were created from are available (H-3030),
     *   we can follow these references to construct the history.
     */
    const editions = [...editionsData.getEntitySubgraph.subgraph.roots].sort(
      (a, b) => (a.revisionId > b.revisionId ? 1 : -1),
    );

    if (editions.length === 0) {
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
    skip: diffPairs.length === 0,
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

    return getHistoryEvents(diffs ?? [], deserializeSubgraph(subgraph));
  }, [diffsData, diffsLoading, diffPairs, editionsData, editionsLoading]);

  const subgraph = editionsData?.getEntitySubgraph.subgraph
    ? deserializeSubgraph(editionsData.getEntitySubgraph.subgraph)
    : undefined;

  const loading = editionsLoading || diffsLoading;

  return (
    <SectionWrapper
      title={"Entity History"}
      titleStartContent={
        <Chip
          size={"xs"}
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
