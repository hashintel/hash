import { useQuery } from "@apollo/client";
import { Chip, WhiteCard } from "@hashintel/design-system";
import { zeroedGraphResolveDepths } from "@local/hash-isomorphic-utils/graph-queries";
import { getEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import type { EntityId } from "@local/hash-subgraph";
import { extractDraftIdFromEntityId } from "@local/hash-subgraph";
import { useMemo } from "react";

import type {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { SectionWrapper } from "../../../shared/section-wrapper";
import type { HistoryEvent } from "./history-section/history-table";
import { HistoryTable } from "./history-section/history-table";

export const HistorySection = ({ entityId }: { entityId: EntityId }) => {
  const isDraft = useMemo(() => {
    const draftId = extractDraftIdFromEntityId(entityId);
    return !!draftId;
  }, [entityId]);

  const { data, loading } = useQuery<GetEntityQuery, GetEntityQueryVariables>(
    getEntityQuery,
    {
      fetchPolicy: "cache-and-network",
      variables: {
        entityId,
        includeDrafts: isDraft,
        includePermissions: false,
        ...zeroedGraphResolveDepths,
      },
    },
  );

  const historyEvents = useMemo<HistoryEvent[]>(() => {
    return [
      {
        number: "1",
        type: "created",
        timestamp: new Date().toISOString(),
      },
    ];
  }, []);

  return (
    <SectionWrapper
      title="Entity History"
      titleStartContent={
        <Chip
          size="xs"
          label="10 events"
          sx={{ color: ({ palette }) => palette.gray[70] }}
        />
      }
    >
      <WhiteCard>
        <HistoryTable events={historyEvents} />
      </WhiteCard>
    </SectionWrapper>
  );
};
