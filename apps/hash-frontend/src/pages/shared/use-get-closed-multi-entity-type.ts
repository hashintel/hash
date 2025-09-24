import { useLazyQuery } from "@apollo/client";
import type {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ClosedMultiEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getClosedMultiEntityTypeFromMap } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { useCallback } from "react";

import type {
  GetClosedMultiEntityTypesQuery,
  GetClosedMultiEntityTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { getClosedMultiEntityTypesQuery } from "../../graphql/queries/ontology/entity-type.queries";

/**
 * Retrieve the type information for multiple {@link ClosedMultiEntityType}.
 */
type GetClosedMultiEntityTypes = (
  /**
   * A list, where each entry is a list of entityTypeIds to be turned into a {@link ClosedMultiEntityType}.
   */
  multiEntityTypeIds: VersionedUrl[][],
) => Promise<{
  /**
   * A map of {@link ClosedMultiEntityType}s. Retrieval of a given closed multi-entity type is via {@link getClosedMultiEntityTypeFromMap}.
   */
  closedMultiEntityTypes: ClosedMultiEntityTypesRootMap;
  /**
   * Information on other types referred to by the ClosedMultiEntityType: property types, data types, and entity types which are links or link destinations.
   */
  closedMultiEntityTypesDefinitions: ClosedMultiEntityTypesDefinitions;
}>;

export const useGetClosedMultiEntityTypes = (): {
  getClosedMultiEntityTypes: GetClosedMultiEntityTypes;
  loading: boolean;
} => {
  const [getMultiEntityType, { loading }] = useLazyQuery<
    GetClosedMultiEntityTypesQuery,
    GetClosedMultiEntityTypesQueryVariables
  >(getClosedMultiEntityTypesQuery, {
    fetchPolicy: "cache-first",
  });

  const getClosedMultiEntityTypes = useCallback(
    async (multiEntityTypeIds: VersionedUrl[][]) => {
      const response = await getMultiEntityType({
        variables: {
          request: {
            entityTypeIds: multiEntityTypeIds,
            temporalAxes: currentTimeInstantTemporalAxes,
            includeResolved: "resolvedWithDataTypeChildren",
          },
        },
      });

      if (!response.data) {
        throw new Error(
          `Failed to fetch closedMultiEntityTypes for ids ${multiEntityTypeIds.map((ids) => ids.join(", ")).join("; ")}`,
        );
      }

      const { closedMultiEntityTypes, definitions } =
        response.data.getClosedMultiEntityTypes;

      return {
        closedMultiEntityTypes,
        closedMultiEntityTypesDefinitions: definitions!,
      };
    },
    [getMultiEntityType],
  );

  return {
    getClosedMultiEntityTypes,
    loading,
  };
};
