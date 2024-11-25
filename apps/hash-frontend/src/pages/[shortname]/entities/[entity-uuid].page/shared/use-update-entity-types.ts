import { useLazyQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";

import type {
  GetClosedMultiEntityTypeQuery,
  GetClosedMultiEntityTypeQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { getClosedMultiEntityTypeQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";
import type { EntityEditorProps } from "../entity-editor";

export const useUpdateEntityTypes = () => {
  const [getClosedMultiEntityType] = useLazyQuery<
    GetClosedMultiEntityTypeQuery,
    GetClosedMultiEntityTypeQueryVariables
  >(getClosedMultiEntityTypeQuery, {
    fetchPolicy: "cache-first",
  });

  return useCallback(
    async ({
      newEntityTypeIds,
      setEntityTypeDetailsState,
    }: {
      newEntityTypeIds: VersionedUrl[];
      setEntityTypeDetailsState: Dispatch<
        SetStateAction<
          | Pick<
              EntityEditorProps,
              "closedMultiEntityType" | "closedMultiEntityTypesDefinitions"
            >
          | undefined
        >
      >;
    }) => {
      const response = await getClosedMultiEntityType({
        variables: {
          entityTypeIds: [...newEntityTypeIds],
          includeArchived: false,
          includeDrafts: false,
        },
      });

      if (!response.data) {
        throw new Error(
          `Failed to fetch closedMultiEntityType for ids ${[...newEntityTypeIds].join(", ")}`,
        );
      }

      const { definitions, closedMultiEntityType } =
        response.data.getClosedMultiEntityType;

      setEntityTypeDetailsState({
        closedMultiEntityType,
        closedMultiEntityTypesDefinitions: definitions,
      });
    },
    [getClosedMultiEntityType],
  );
};
