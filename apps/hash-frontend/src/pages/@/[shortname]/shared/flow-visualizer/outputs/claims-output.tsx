import { useQuery } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import { entityIdFromComponents } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { Claim } from "@local/hash-isomorphic-utils/system-types/claim";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../../../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../../../../graphql/queries/knowledge/entity.queries";
import { ClaimsTable } from "../../../../../shared/claims-table";
import { useFlowRunsContext } from "../../../../../shared/flow-runs-context";
import { useSlideStack } from "../../../../../shared/slide-stack";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";
import { TableSkeleton } from "./shared/table-skeleton";

type ClaimsTableProps = {
  proposedEntities: Pick<ProposedEntity, "claims" | "localEntityId">[];
};

export const ClaimsOutput = memo(({ proposedEntities }: ClaimsTableProps) => {
  const { selectedFlowRun } = useFlowRunsContext();
  const { pushToSlideStack } = useSlideStack();

  const { data: claimsData, loading: claimsDataLoading } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: {
      includePermissions: false,
      request: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.claim.entityTypeId,
              {
                ignoreParents: true,
              },
            ),
            {
              equal: [
                {
                  path: ["editionProvenance", "origin", "id"],
                },
                {
                  parameter: selectedFlowRun
                    ? entityIdFromComponents(
                        selectedFlowRun.webId,
                        selectedFlowRun.flowRunId,
                      )
                    : "never",
                },
              ],
            },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasLeftEntity: { incoming: 1, outgoing: 1 },
          hasRightEntity: { outgoing: 1, incoming: 1 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: true,
      },
    },
    pollInterval: selectedFlowRun?.closedAt ? 0 : 2_000,
    skip: !selectedFlowRun,
    fetchPolicy: "cache-and-network",
  });

  const outputContainerRef = useRef<HTMLDivElement>(null);
  const [outputContainerHeight, setOutputContainerHeight] = useState(400);
  useLayoutEffect(() => {
    if (
      outputContainerRef.current &&
      outputContainerRef.current.clientHeight !== outputContainerHeight
    ) {
      setOutputContainerHeight(outputContainerRef.current.clientHeight);
    }
  }, [outputContainerHeight]);

  const { claimsSubgraph, hasClaims } = useMemo(() => {
    if (claimsData) {
      const subgraph = deserializeSubgraph<EntityRootType<HashEntity<Claim>>>(
        claimsData.getEntitySubgraph.subgraph,
      );

      const roots = getRoots(subgraph);

      return {
        claimsSubgraph: subgraph,
        hasClaims: roots.length > 0,
      };
    }

    return {
      claimsSubgraph: undefined,
      hasClaims: false,
    };
  }, [claimsData]);

  return (
    <OutputContainer
      noBorder={hasClaims}
      ref={outputContainerRef}
      sx={{
        flex: 1,
        minWidth: 400,
        "& th:not(:last-child)": {
          borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
        },
      }}
    >
      {hasClaims && claimsSubgraph ? (
        <ClaimsTable
          claimsSubgraph={claimsSubgraph}
          includeStatusColumn
          onEntityClick={(entityId) => {
            pushToSlideStack({
              kind: "entity",
              itemId: entityId,
            });
          }}
          proposedEntities={proposedEntities}
        />
      ) : claimsDataLoading ? (
        <TableSkeleton cellHeight={43} tableHeight={outputContainerHeight} />
      ) : (
        <EmptyOutputBox
          Icon={outputIcons.table}
          label="Claims about entities discovered by this flow will appear in a table here"
        />
      )}
    </OutputContainer>
  );
});
