import { useMutation } from "@apollo/client";
import type { WebId } from "@blockprotocol/type-system";
import {
  HashEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import { useCallback } from "react";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import {
  createEntityMutation,
  queryEntitySubgraphQuery,
} from "../../../../graphql/queries/knowledge/entity.queries";
import { useActiveWorkspace } from "../../../../pages/shared/workspace-context";
import { generateSidebarEntityTypeEntitiesQueryVariables } from "../../../../shared/use-entity-type-entities";
import type { CreateEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolCreateEntity = (
  webId: WebId | null,
  readonly?: boolean,
): {
  createEntity: CreateEntityMessageCallback;
} => {
  const { activeWorkspaceWebId } = useActiveWorkspace();

  const [createFn] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation, {
    refetchQueries: activeWorkspaceWebId
      ? [
          /**
           * This refetch query accounts for the "Entities" section
           * in the sidebar being updated when the first instance of
           * a type is created by a user that is from a different web.
           */
          {
            query: queryEntitySubgraphQuery,
            variables: generateSidebarEntityTypeEntitiesQueryVariables({
              webId: activeWorkspaceWebId,
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

      if (!webId) {
        throw new Error(
          "Hook was constructed without `webId` while not in readonly mode. Data must be created under an account.",
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

      const { entityTypeIds, properties, linkData } = data;

      const { data: createEntityResponseData } = await createFn({
        variables: {
          entityTypeIds,
          webId,
          properties: mergePropertyObjectAndMetadata(properties, undefined),
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
        data: new HashEntity(createdEntity),
      };
    },
    [createFn, webId, readonly],
  );

  return {
    createEntity,
  };
};
