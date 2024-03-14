import { useQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { useMemo } from "react";

import type {
  CheckUserPermissionsOnEntityTypeQuery,
  CheckUserPermissionsOnEntityTypeQueryVariables,
} from "../graphql/api-types.gen";
import { checkUserPermissionsOnEntityTypeQuery } from "../graphql/queries/ontology/entity-type.queries";

export const useUserPermissionsOnEntityType = (entityTypeId?: VersionedUrl) => {
  const { data, ...rest } = useQuery<
    CheckUserPermissionsOnEntityTypeQuery,
    CheckUserPermissionsOnEntityTypeQueryVariables
  >(checkUserPermissionsOnEntityTypeQuery, {
    variables: {
      entityTypeId: entityTypeId!, // query will not be called if there is no entityTypeId
    },
    fetchPolicy: "cache-and-network",
    skip: !entityTypeId,
  });

  return useMemo(
    () => ({
      userPermissions: data?.checkUserPermissionsOnEntityType,
      ...rest,
    }),
    [data, rest],
  );
};
