import { useQuery } from "@apollo/client";
import type { EntityMetadata } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  CheckUserPermissionsOnEntityQuery,
  CheckUserPermissionsOnEntityQueryVariables,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { checkUserPermissionsOnEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import { useMemo } from "react";

export const useUserPermissionsOnEntity = (
  entity?: Pick<HashEntity, "metadata">,
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
