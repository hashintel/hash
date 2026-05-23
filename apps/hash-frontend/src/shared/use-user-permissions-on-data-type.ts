import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { checkUserPermissionsOnDataTypeQuery } from "../graphql/queries/ontology/data-type.queries";

import type {
  CheckUserPermissionsOnDataTypeQuery,
  CheckUserPermissionsOnDataTypeQueryVariables,
} from "../graphql/api-types.gen";
import type { VersionedUrl } from "@blockprotocol/type-system";

export const useUserPermissionsOnDataType = (dataTypeId?: VersionedUrl) => {
  const { data, ...rest } = useQuery<
    CheckUserPermissionsOnDataTypeQuery,
    CheckUserPermissionsOnDataTypeQueryVariables
  >(checkUserPermissionsOnDataTypeQuery, {
    variables: {
      dataTypeId: dataTypeId!, // query will not be called if there is no dataTypeId
    },
    fetchPolicy: "cache-and-network",
    skip: !dataTypeId,
  });

  return useMemo(
    () => ({
      userPermissions: data?.checkUserPermissionsOnDataType,
      ...rest,
    }),
    [data, rest],
  );
};
