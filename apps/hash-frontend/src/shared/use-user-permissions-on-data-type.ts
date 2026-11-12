import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";

import { checkUserPermissionsOnDataTypeQuery } from "../graphql/queries/ontology/data-type.queries";

import type {
  CheckUserPermissionsOnDataTypeQuery,
  CheckUserPermissionsOnDataTypeQueryVariables,
} from "../graphql/api-types.gen";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

/**
 * Permissions are policy checks against the type's web, so they hold across
 * versions of one base URL. A save remounts its editor on the new version's
 * $id, re-running this query cold — this cache answers for the new version
 * while it loads, so the just-saved editor doesn't flash read-only.
 */
const lastKnownPermissionsByBaseUrl = new Map<
  BaseUrl,
  NonNullable<
    CheckUserPermissionsOnDataTypeQuery["checkUserPermissionsOnDataType"]
  >
>();

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

  return useMemo(() => {
    const baseUrl = dataTypeId ? extractBaseUrl(dataTypeId) : null;
    const fetched = data?.checkUserPermissionsOnDataType;

    if (fetched && baseUrl) {
      lastKnownPermissionsByBaseUrl.set(baseUrl, fetched);
    }

    return {
      userPermissions:
        fetched ??
        (baseUrl ? lastKnownPermissionsByBaseUrl.get(baseUrl) : undefined),
      ...rest,
    };
  }, [data, dataTypeId, rest]);
};
