import { useMutation } from "@apollo/client";
import { OwnedById } from "@local/hash-subgraph";
import { useCallback } from "react";

import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import {
  createEntityMutation,
  queryEntitiesQuery,
} from "../../../../graphql/queries/knowledge/entity.queries";
import { useActiveWorkspace } from "../../../../pages/shared/workspace-context";
import { generateUseEntityTypeEntitiesQueryVariables } from "../../../../shared/use-entity-type-entities";
import { CreateEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolCreateEntity = (
  ownedById: OwnedById | null,
  readonly?: boolean,
): {
  createEntity: CreateEntityMessageCallback;
} => {
  const { activeWorkspaceOwnedById } = useActiveWorkspace();

  const [createFn] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation, {
    refetchQueries:
      ownedById === activeWorkspaceOwnedById
        ? [
            /**
             * This refetch query accounts for the "Entities" section
             * in the sidebar being updated when the first instance of
             * a type is created by a user that is from a different web.
             */
            {
              query: queryEntitiesQuery,
              variables: generateUseEntityTypeEntitiesQueryVariables({
                ownedById: activeWorkspaceOwnedById,
              }),
            },
          ]
        : [],
  });

  const createEntity: CreateEntityMessageCallback = useCallback(
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

      if (!ownedById) {
        throw new Error(
          "Hook was constructed without `ownedById` while not in readonly mode. Data must be created under an account.",
        );
      }

      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for createEntity",
            },
          ],
        };
      }

      const { entityTypeId, properties, linkData } = data;

      const { data: createEntityResponseData } = await createFn({
        variables: {
          entityTypeId,
          ownedById,
          properties,
          linkData,
        },
      });

      const { createEntity: createdEntity } = createEntityResponseData ?? {};

      if (!createdEntity) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling createEntity",
            },
          ],
        };
      }

      return {
        data: createdEntity,
      };
    },
    [createFn, ownedById, readonly],
  );

  return {
    createEntity,
  };
};
