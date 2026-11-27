import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";

import { checkUserPermissionsOnDataTypesQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import { useMemoCompare } from "../../../../shared/use-memo-compare";

import type {
  CheckUserPermissionsOnDataTypesQuery,
  CheckUserPermissionsOnDataTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { ConversionGroup } from "../conversion-util";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

const sameBaseUrls = (previous: VersionedUrl[], next: VersionedUrl[]) =>
  previous.length === next.length &&
  previous.every((dataTypeId, index) => {
    const nextId = next[index];
    return (
      nextId !== undefined &&
      extractBaseUrl(dataTypeId) === extractBaseUrl(nextId)
    );
  });

/**
 * Which data types the user may update, by the backend's own policy check —
 * the same evaluation the save path's updates are gated on. Editing a
 * conversion republishes whichever type stores it, so this covers every
 * conversion-group member alongside the types in the user's own webs;
 * anything else falls back to the caller's local approximation. Null while
 * the check is in flight; keyed by base URL since the policy is
 * version-independent, so a catalogue refetch that only bumps versions
 * doesn't re-run it.
 */
export const useDataTypeEditPermissions = ({
  latestDataTypes,
  conversionGroups,
  editableWebIds,
  skip,
}: {
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
  conversionGroups: ReadonlyMap<BaseUrl, ConversionGroup>;
  editableWebIds: ReadonlySet<string>;
  skip?: boolean;
}): ReadonlyMap<BaseUrl, boolean> | null => {
  const dataTypeIds = useMemoCompare(
    () =>
      Object.values(latestDataTypes)
        .filter(
          (dataType) =>
            conversionGroups.has(dataType.metadata.recordId.baseUrl) ||
            ("webId" in dataType.metadata &&
              editableWebIds.has(dataType.metadata.webId)),
        )
        .sort((a, b) =>
          a.metadata.recordId.baseUrl.localeCompare(
            b.metadata.recordId.baseUrl,
          ),
        )
        .map((dataType) => dataType.schema.$id),
    [latestDataTypes, conversionGroups, editableWebIds],
    sameBaseUrls,
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
