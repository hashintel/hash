import { useQuery } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { EntityRootType } from "@local/hash-subgraph/.";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Container, Divider } from "@mui/material";
import { Fragment, FunctionComponent, useMemo } from "react";

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { DraftEntity } from "./draft-entity";
import { getDraftEntitiesQueryVariables } from "./get-draft-entities-query";

export const DraftEntities: FunctionComponent = () => {
  const { data } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: getDraftEntitiesQueryVariables,
  });

  const subgraph = useMemo(
    () =>
      data
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            data.structuralQueryEntities.subgraph,
          )
        : undefined,
    [data],
  );

  const draftEntities = useMemo(
    () => (subgraph ? getRoots(subgraph) : undefined),
    [subgraph],
  );

  return (
    <Container>
      {draftEntities && draftEntities.length === 0 ? (
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
          {draftEntities && subgraph ? (
            draftEntities.map((entity, i, all) => (
              <Fragment key={entity.metadata.recordId.entityId}>
                <DraftEntity entity={entity} subgraph={subgraph} />
                {i < all.length - 1 ? (
                  <Divider
                    sx={{ borderColor: ({ palette }) => palette.gray[30] }}
                  />
                ) : null}
              </Fragment>
            ))
          ) : (
            <>Skeleton</>
          )}
        </Box>
      )}
    </Container>
  );
};
