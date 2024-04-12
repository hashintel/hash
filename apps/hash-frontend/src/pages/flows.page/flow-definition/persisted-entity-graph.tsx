import { EntitiesGraphChart } from "@hashintel/block-design-system";
import { VersionedUrl } from "@blockprotocol/type-system";
import { Entity, EntityTypeRootType, Subgraph } from "@local/hash-subgraph";
import { useQuery } from "@apollo/client";
import {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../graphql/api-types.gen";
import { queryEntityTypesQuery } from "../../../graphql/queries/ontology/entity-type.queries";
import {
  fullOntologyResolveDepths,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { Box, SxProps, Theme } from "@mui/material";

type PersistedEntityGraphProps = {
  persistedEntities: Entity[];
};

const containerSx = {
  height: "100%",
  width: "100%",
  background: ({ palette }) => palette.common.white,
  border: ({ palette }) => `1px solid ${palette.gray[20]}`,
  borderRadius: 2,
} satisfies SxProps<Theme>;

export const PersistedEntityGraph = ({
  persistedEntities,
}: PersistedEntityGraphProps) => {
  const entityTypeIds = persistedEntities.map(
    (entity) => entity.metadata.entityTypeId,
  );

  const { data: entityTypeResultData, loading: entityTypesLoading } = useQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    variables: {
      filter: {
        any: entityTypeIds.map((entityTypeId) =>
          generateVersionedUrlMatchingFilter(entityTypeId, {
            ignoreParents: true,
          }),
        ),
      },
      latestOnly: true,
      ...zeroedGraphResolveDepths,
      ...fullOntologyResolveDepths,
    },
    skip: persistedEntities.length === 0,
  });

  const entityTypeSubgraph = entityTypeResultData?.queryEntityTypes as
    | Subgraph<EntityTypeRootType>
    | undefined;

  if (!entityTypeSubgraph && !persistedEntities.length) {
    return <Box sx={containerSx} />;
  }

  return (
    <EntitiesGraphChart
      entities={persistedEntities}
      sx={containerSx}
      subgraph={entityTypeSubgraph}
    />
  );
};
