import { useLazyQuery, useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  GetEntityTypeRootedSubgraphQuery,
  GetEntityTypeRootedSubgraphQueryVariables,
  CreatePersistedEntityMutation,
  CreatePersistedEntityMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { getEntityTypeRootedSubgraphQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { createPersistedEntityMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import { CreateEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolCreateEntity = (
  readonly?: boolean,
): {
  createEntity: CreateEntityMessageCallback;
} => {
  const [createFn] = useMutation<
    CreatePersistedEntityMutation,
    CreatePersistedEntityMutationVariables
  >(createPersistedEntityMutation);

  const [getEntityTypeRootedSubgraphFn] = useLazyQuery<
    GetEntityTypeRootedSubgraphQuery,
    GetEntityTypeRootedSubgraphQueryVariables
  >(getEntityTypeRootedSubgraphQuery);

  const createPersistedEntity: CreateEntityMessageCallback = useCallback(
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
              message: "'data' must be provided for createPersistedEntity",
            },
          ],
        };
      }

      const { entityTypeId, properties } = data;

      const { data: responseData } = await createFn({
        variables: {
          entityTypeId,
          properties,
        },
      });

      const { createPersistedEntity: createdEntity } = responseData ?? {
        createPersistedEntity: null,
      };

      if (!createdEntity) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling createPersistedEntity",
            },
          ],
        };
      }

      /**
       * @todo: the EntityTypeRootedSubgraph is not returned from the `createEntity` mutation.
       * May be addressed as part of https://app.asana.com/0/1200211978612931/1203089535761796/f or related work.
       */

      const { data: entityTypeResponseData } =
        await getEntityTypeRootedSubgraphFn({
          query: getEntityTypeRootedSubgraphQuery,
          variables: {
            entityTypeId: createdEntity.entityTypeId,
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
          ...createdEntity,
          entityTypeRootedSubgraph: entityTypeResponseData.getEntityType,
        },
      };
    },
    [createFn, readonly, getEntityTypeRootedSubgraphFn],
  );

  return {
    createEntity: createPersistedEntity,
  };
};
