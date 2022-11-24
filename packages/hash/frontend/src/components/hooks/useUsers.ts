import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { types } from "@hashintel/hash-shared/types";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import { constructUser, User } from "../../lib/user";
import {
  GetAllLatestEntitiesWithMetadataQuery,
  GetAllLatestEntitiesWithMetadataQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAllLatestEntitiesWithMetadataQuery } from "../../graphql/queries/knowledge/entity.queries";

export const useUsers = (): {
  loading: boolean;
  users?: User[];
} => {
  const { data, loading } = useQuery<
    GetAllLatestEntitiesWithMetadataQuery,
    GetAllLatestEntitiesWithMetadataQueryVariables
  >(getAllLatestEntitiesWithMetadataQuery, {
    variables: {
      dataTypeResolveDepth: 0,
      propertyTypeResolveDepth: 0,
      entityTypeResolveDepth: 1,
      entityResolveDepth: 2,
    },
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const { getAllLatestEntitiesWithMetadata: subgraph } = data ?? {};

  const users = useMemo(() => {
    if (!subgraph) {
      return undefined;
    }
    /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
    return getRoots(subgraph as Subgraph<SubgraphRootTypes["entity"]>)
      .filter(
        ({ metadata: { entityTypeId } }) =>
          entityTypeId === types.entityType.user.entityTypeId,
      )
      .map(({ metadata: { editionId } }) =>
        constructUser({
          subgraph,
          userEntityEditionId: editionId,
        }),
      );
  }, [subgraph]);

  return {
    loading,
    users,
  };
};
