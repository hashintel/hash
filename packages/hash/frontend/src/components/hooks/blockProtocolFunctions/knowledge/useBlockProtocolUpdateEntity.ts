import { useLazyQuery, useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  GetEntityTypeRootedSubgraphQuery,
  GetEntityTypeRootedSubgraphQueryVariables,
  UpdatePersistedEntityMutation,
  UpdatePersistedEntityMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { getEntityTypeRootedSubgraphQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { updatePersistedEntityMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import { UpdateEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolUpdateEntity = (
  readonly?: boolean,
): {
  updateEntity: UpdateEntityMessageCallback;
} => {
  const [updateFn] = useMutation<
    UpdatePersistedEntityMutation,
    UpdatePersistedEntityMutationVariables
  >(updatePersistedEntityMutation);

  const [getEntityTypeRootedSubgraphFn] = useLazyQuery<
    GetEntityTypeRootedSubgraphQuery,
    GetEntityTypeRootedSubgraphQueryVariables
  >(getEntityTypeRootedSubgraphQuery);

  const updatePersistedEntity: UpdateEntityMessageCallback = useCallback(
    async ({ data }) => {
      if (readonly) {
        return {
          errors: [
            {
              code: "FORBIDDEN",
              message: "Operation can't be carried out in readonly mode",
            },
          ],
        };
      }

      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for updatePersistedEntity",
            },
          ],
        };
      }

      const { entityId, updatedProperties } = data;
      const { data: responseData } = await updateFn({
        variables: {
          entityId,
          updatedProperties,
        },
      });

      const { updatePersistedEntity: updatedEntity } = responseData ?? {
        updatePersistedEntity: null,
      };

      if (!updatedEntity) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling updatePersistedEntity",
            },
          ],
        };
      }

      /**
       * @todo: the EntityTypeRootedSubraph is not returned from the `updateEntity` mutation.
       * May be addressed as part of https://app.asana.com/0/1200211978612931/1203089535761796/f or related work.
       */

      const { data: entityTypeResponseData } =
        await getEntityTypeRootedSubgraphFn({
          query: getEntityTypeRootedSubgraphQuery,
          variables: {
            entityTypeId: updatedEntity.entityTypeId,
          },
        });

      if (!entityTypeResponseData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message:
                "Error getting the subgraph rooted at entity's entity type",
            },
          ],
        };
      }

      return {
        data: {
          ...updatedEntity,
          entityTypeRootedSubgraph: entityTypeResponseData.getEntityType,
        },
      };
    },
    [updateFn, readonly, getEntityTypeRootedSubgraphFn],
  );

  return {
    updateEntity: updatePersistedEntity,
  };
};
