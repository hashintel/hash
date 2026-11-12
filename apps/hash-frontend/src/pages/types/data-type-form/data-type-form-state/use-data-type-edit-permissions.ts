import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";

import { checkUserPermissionsOnDataTypesQuery } from "../../../../graphql/queries/ontology/data-type.queries";

import type {
  CheckUserPermissionsOnDataTypesQuery,
  CheckUserPermissionsOnDataTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { BaseUrl, DataTypeWithMetadata } from "@blockprotocol/type-system";

/**
 * Which data types the user may update, by the backend's own policy check —
 * the same evaluation the save path's updates are gated on. Editing a
 * conversion republishes whichever type stores it, so the editor needs this
 * answer for every type a conversion plan might touch, not just the viewed
 * one. Null while the check is in flight (callers fall back to a local
 * approximation); keyed by base URL since the policy is version-independent.
 */
export const useDataTypeEditPermissions = ({
  latestDataTypes,
  skip,
}: {
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
  skip?: boolean;
}): ReadonlyMap<BaseUrl, boolean> | null => {
  const dataTypeIds = useMemo(
    () => Object.values(latestDataTypes).map((dataType) => dataType.schema.$id),
    [latestDataTypes],
  );

  const { data } = useQuery<
    CheckUserPermissionsOnDataTypesQuery,
    CheckUserPermissionsOnDataTypesQueryVariables
  >(checkUserPermissionsOnDataTypesQuery, {
    variables: { dataTypeIds },
    fetchPolicy: "cache-and-network",
    skip: !!skip || dataTypeIds.length === 0,
  });

  return useMemo(
    () =>
      data
        ? new Map(
            data.checkUserPermissionsOnDataTypes.map((record) => [
              extractBaseUrl(record.dataTypeId),
              record.permissions.edit,
            ]),
          )
        : null,
    [data],
  );
};
