import { useQuery } from "@apollo/client";
import type {
  CheckUserPermissionsOnEntityQuery,
  CheckUserPermissionsOnEntityQueryVariables,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { checkUserPermissionsOnEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import type { Entity, EntityMetadata } from "@local/hash-subgraph";
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
