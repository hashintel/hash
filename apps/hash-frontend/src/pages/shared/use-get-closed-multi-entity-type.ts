import { useLazyQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { useCallback } from "react";

import type {
  GetClosedMultiEntityTypeQuery,
  GetClosedMultiEntityTypeQueryVariables,
} from "../../graphql/api-types.gen";
import { getClosedMultiEntityTypeQuery } from "../../graphql/queries/ontology/entity-type.queries";

export const useGetClosedMultiEntityType = () => {
  const [getMultiEntityType, { loading }] = useLazyQuery<
    GetClosedMultiEntityTypeQuery,
    GetClosedMultiEntityTypeQueryVariables
  >(getClosedMultiEntityTypeQuery, {
    fetchPolicy: "cache-first",
  });

  const getClosedMultiEntityType = useCallback(
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

      const { closedMultiEntityType, definitions } =
        response.data.getClosedMultiEntityType;

      return {
        closedMultiEntityType,
        closedMultiEntityTypesDefinitions: definitions,
      };
    },
    [getMultiEntityType],
  );

  return {
    getClosedMultiEntityType,
    loading,
  };
};
