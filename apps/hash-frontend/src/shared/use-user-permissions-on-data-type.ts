import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";

import { checkUserPermissionsOnDataTypeQuery } from "../graphql/queries/ontology/data-type.queries";
import { useAuthInfo } from "../pages/shared/auth-info-context";

import type {
  CheckUserPermissionsOnDataTypeQuery,
  CheckUserPermissionsOnDataTypeQueryVariables,
} from "../graphql/api-types.gen";
import type { VersionedUrl } from "@blockprotocol/type-system";

/**
 * Permissions are policy checks against the type's web, so they hold across
 * versions of one base URL. A save remounts its editor on the new version's
 * $id, re-running this query cold — this cache answers for the new version
 * while it loads, so the just-saved editor doesn't flash read-only. Keyed by
 * actor too, so one user's grants never stand in for another's.
 */
const lastKnownPermissions = new Map<
  string,
  NonNullable<
    CheckUserPermissionsOnDataTypeQuery["checkUserPermissionsOnDataType"]
  >
>();

export const useUserPermissionsOnDataType = (dataTypeId?: VersionedUrl) => {
  const { authenticatedUser } = useAuthInfo();
  const actorId = authenticatedUser?.accountId;

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
    const cacheKey =
      dataTypeId && actorId ? `${actorId} ${extractBaseUrl(dataTypeId)}` : null;
    const fetched = data?.checkUserPermissionsOnDataType;

    if (fetched && cacheKey) {
      lastKnownPermissions.set(cacheKey, fetched);
    }

    return {
      userPermissions:
        fetched ??
        (cacheKey && rest.loading
          ? lastKnownPermissions.get(cacheKey)
          : undefined),
      ...rest,
    };
  }, [actorId, data, dataTypeId, rest]);
};
