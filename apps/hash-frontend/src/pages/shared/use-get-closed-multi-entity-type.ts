import { useLazyQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { useCallback } from "react";

import type {
  GetClosedMultiEntityTypesQuery,
  GetClosedMultiEntityTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { getClosedMultiEntityTypesQuery } from "../../graphql/queries/ontology/entity-type.queries";

export const useGetClosedMultiEntityTypes = () => {
  const [getMultiEntityType, { loading }] = useLazyQuery<
    GetClosedMultiEntityTypesQuery,
    GetClosedMultiEntityTypesQueryVariables
  >(getClosedMultiEntityTypesQuery, {
    fetchPolicy: "cache-first",
  });

  const getClosedMultiEntityTypes = useCallback(
    async (newEntityTypeIds: VersionedUrl[]) => {
      const response = await getMultiEntityType({
        variables: {
          entityTypeIds: newEntityTypeIds,
          includeArchived: false,
        },
      });

      if (!response.data) {
        throw new Error(
          `Failed to fetch closedMultiEntityTypes for ids ${[
            ...newEntityTypeIds,
          ].join(", ")}`,
        );
      }

      const { closedMultiEntityTypes, definitions } =
        response.data.getClosedMultiEntityTypes;

      return {
        closedMultiEntityTypes,
        closedMultiEntityTypesDefinitions: definitions,
      };
    },
    [getMultiEntityType],
  );

  return {
    getClosedMultiEntityTypes,
    loading,
  };
};
