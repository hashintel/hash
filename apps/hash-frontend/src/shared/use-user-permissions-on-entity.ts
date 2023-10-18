import { useQuery } from "@apollo/client";
import {
  CheckUserPermissionsOnEntityQuery,
  CheckUserPermissionsOnEntityQueryVariables,
} from "@local/hash-graphql-shared/graphql/api-types.gen";
import { checkUserPermissionsOnEntityQuery } from "@local/hash-graphql-shared/queries/entity.queries";
import { Entity, EntityMetadata } from "@local/hash-subgraph";
import { useMemo } from "react";

export const useUserPermissionsOnEntity = (
  entity?: Pick<Entity, "metadata">,
) => {
  const { data, ...rest } = useQuery<
    CheckUserPermissionsOnEntityQuery,
    CheckUserPermissionsOnEntityQueryVariables
  >(checkUserPermissionsOnEntityQuery, {
    variables: {
      metadata: entity?.metadata as EntityMetadata, // query will not be called if there is no entity
    },
    skip: !entity,
  });

  return useMemo(
    () => ({
      userPermissions: data?.checkUserPermissionsOnEntity,
      ...rest,
    }),
    [data, rest],
  );
};
