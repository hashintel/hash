import { useQuery } from "@apollo/client";
import {
  fullDecisionTimeAxis,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  EntityRootType,
  extractEntityUuidFromEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Container, Divider } from "@mui/material";
import { Fragment, FunctionComponent, useMemo } from "react";

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { getFirstRevisionCreatedAt } from "../../shared/entity-utils";
import { DraftEntity } from "./draft-entity";
import { getDraftEntitiesQueryVariables } from "./get-draft-entities-query";

export type SortOrder = "created-at-asc" | "created-at-desc";

export const DraftEntities: FunctionComponent<{ sortOrder: SortOrder }> = ({
  sortOrder,
}) => {
  const { data: draftEntitiesData } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: getDraftEntitiesQueryVariables,
  });

  const draftEntitiesSubgraph = useMemo(
    () =>
      draftEntitiesData
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            draftEntitiesData.structuralQueryEntities.subgraph,
          )
        : undefined,
    [draftEntitiesData],
  );

  const draftEntities = useMemo(
    () => (draftEntitiesSubgraph ? getRoots(draftEntitiesSubgraph) : undefined),
    [draftEntitiesSubgraph],
  );

  const { data: draftEntityHistoriesData } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      query: {
        filter: {
          any:
            draftEntities?.map((draftEntity) => ({
              equal: [
                { path: ["uuid"] },
                {
                  parameter: extractEntityUuidFromEntityId(
                    draftEntity.metadata.recordId.entityId,
                  ),
                },
              ],
            })) ?? [],
        },
        temporalAxes: fullDecisionTimeAxis,
        graphResolveDepths: zeroedGraphResolveDepths,
      },
      includePermissions: false,
    },
    skip: !draftEntities,
  });

  const draftEntityHistoriesSubgraph = useMemo(
    () =>
      draftEntityHistoriesData
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            draftEntityHistoriesData.structuralQueryEntities.subgraph,
          )
        : undefined,
    [draftEntityHistoriesData],
  );

  const draftEntitiesWithCreatedAt = useMemo(() => {
    if (!draftEntities || !draftEntityHistoriesSubgraph) {
      return undefined;
    }

    return draftEntities.map((entity) => ({
      entity,
      createdAt: getFirstRevisionCreatedAt(
        draftEntityHistoriesSubgraph,
        entity.metadata.recordId.entityId,
      ),
    }));
  }, [draftEntityHistoriesSubgraph, draftEntities]);

  const sortedDraftEntitiesWithCreatedAt = useMemo(
    () =>
      draftEntitiesWithCreatedAt?.sort((a, b) =>
        sortOrder === "created-at-asc"
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime(),
      ),
    [draftEntitiesWithCreatedAt, sortOrder],
  );

  return (
    <Container>
      {draftEntitiesWithCreatedAt && draftEntitiesWithCreatedAt.length === 0 ? (
        <>No drafts</>
      ) : (
        <Box
          sx={{
            background: ({ palette }) => palette.common.white,
            borderRadius: "8px",
            borderColor: ({ palette }) => palette.gray[30],
            borderWidth: 1,
            borderStyle: "solid",
          }}
        >
          {sortedDraftEntitiesWithCreatedAt && draftEntitiesSubgraph ? (
            sortedDraftEntitiesWithCreatedAt.map(
              ({ entity, createdAt }, i, all) => (
                <Fragment key={entity.metadata.recordId.entityId}>
                  <DraftEntity
                    entity={entity}
                    createdAt={createdAt}
                    subgraph={draftEntitiesSubgraph}
                  />
                  {i < all.length - 1 ? (
                    <Divider
                      sx={{ borderColor: ({ palette }) => palette.gray[30] }}
                    />
                  ) : null}
                </Fragment>
              ),
            )
          ) : (
            <>Skeleton</>
          )}
        </Box>
      )}
    </Container>
  );
};
