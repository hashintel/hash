import { useQuery } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { Chip, Skeleton } from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { Claim } from "@local/hash-isomorphic-utils/system-types/claim";
import { Box } from "@mui/material";
import { useMemo } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { LinksIcon } from "../../../../shared/icons/svg";
import { SectionEmptyState } from "../../../@/[shortname]/shared/section-empty-state";
import { ClaimsTable } from "../../claims-table";
import { SectionWrapper } from "../../section-wrapper";
import { virtualizedTableHeaderHeight } from "../../virtualized-table/header";
import { useEntityEditor } from "./entity-editor-context";
import {
  linksTableRowHeight,
  maxLinksTableHeight,
} from "./links-section/shared/table-styling";

export const ClaimsSection = () => {
  const { entity, onEntityClick, isLocalDraftOnly } = useEntityEditor();

  const entityUuid = useMemo(() => {
    return extractEntityUuidFromEntityId(entity.metadata.recordId.entityId);
  }, [entity]);

  const { data: claimsData } = useQuery<
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
                { path: ["outgoingLinks", "rightEntity", "uuid"] },
                {
                  parameter: entityUuid,
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
    skip: !entityUuid || isLocalDraftOnly,
    fetchPolicy: "cache-and-network",
  });

  const { claimsSubgraph, numberOfClaims } = useMemo(() => {
    if (claimsData) {
      const subgraph = deserializeSubgraph<EntityRootType<HashEntity<Claim>>>(
        claimsData.getEntitySubgraph.subgraph,
      );

      const roots = getRoots(subgraph);

      return {
        claimsSubgraph: subgraph,
        numberOfClaims: roots.length,
      };
    }

    return {
      claimsSubgraph: undefined,
      numberOfClaims: 0,
    };
  }, [claimsData]);

  const height = Math.min(
    maxLinksTableHeight,
    numberOfClaims * linksTableRowHeight +
      virtualizedTableHeaderHeight +
      /** borders */
      2 +
      /** scrollbar */
      16,
  );

  if (isLocalDraftOnly) {
    return null;
  }

  return (
    <SectionWrapper
      title="Claims"
      titleTooltip="Claims are statements made about entities, inferred from public or private data sources."
      titleStartContent={
        <Chip
          size="xs"
          label={`${numberOfClaims} ${numberOfClaims === 1 ? "claim" : "claims"}`}
        />
      }
    >
      {!claimsSubgraph ? (
        <Skeleton height={200} />
      ) : !numberOfClaims ? (
        <SectionEmptyState
          title="This entity currently has no claims linked to it"
          titleIcon={<LinksIcon />}
          description="Claims are statements made about entities, inferred from public or private data sources"
        />
      ) : (
        <Box sx={{ height }}>
          <ClaimsTable
            claimsSubgraph={claimsSubgraph}
            includeStatusColumn={false}
            onEntityClick={onEntityClick}
          />
        </Box>
      )}
    </SectionWrapper>
  );
};
