import { useQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { useMemo } from "react";

import type {
  CheckUserPermissionsOnDataTypeQuery,
  CheckUserPermissionsOnDataTypeQueryVariables,
} from "../graphql/api-types.gen";
import { checkUserPermissionsOnDataTypeQuery } from "../graphql/queries/ontology/data-type.queries";

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
