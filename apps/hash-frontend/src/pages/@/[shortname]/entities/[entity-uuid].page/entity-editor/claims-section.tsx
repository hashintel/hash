import { useQuery } from "@apollo/client";
import { Chip, Skeleton } from "@hashintel/design-system";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { Claim } from "@local/hash-isomorphic-utils/system-types/claim";
import {
  type EntityRootType,
  extractEntityUuidFromEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box } from "@mui/material";
import { useMemo } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../../../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../../../../graphql/queries/knowledge/entity.queries";
import { LinksIcon } from "../../../../../../shared/icons/svg";
import { ClaimsTable } from "../../../../../shared/claims-table";
import { SectionWrapper } from "../../../../../shared/section-wrapper";
import { virtualizedTableHeaderHeight } from "../../../../../shared/virtualized-table/header";
import { SectionEmptyState } from "../../../shared/section-empty-state";
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
      const subgraph = deserializeSubgraph<EntityRootType<Claim>>(
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
