import { useLazyQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { useCallback } from "react";

import type {
  GetClosedMultiEntityTypesQuery,
  GetClosedMultiEntityTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { getClosedMultiEntityTypeQuery } from "../../graphql/queries/ontology/entity-type.queries";

export const useGetClosedMultiEntityType = () => {
  const [getMultiEntityType, { loading }] = useLazyQuery<
    GetClosedMultiEntityTypesQuery,
    GetClosedMultiEntityTypesQueryVariables
  >(getClosedMultiEntityTypeQuery, {
    fetchPolicy: "cache-first",
  });

  const getClosedMultiEntityTypes = useCallback(
    async (newEntityTypeIds: VersionedUrl[]) => {
      const response = await getMultiEntityType({
        variables: {
          entityTypeIds: newEntityTypeIds,
          includeArchived: false,
          includeDrafts: false,
        },
      });

      if (!response.data) {
        throw new Error(
          `Failed to fetch closedMultiEntityType for ids ${[...newEntityTypeIds].join(", ")}`,
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
