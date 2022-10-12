import { useLazyQuery, useMutation } from "@apollo/client";
import { useCallback } from "react";

import { QueryOutgoingPersistedLinksArgs } from "@hashintel/hash-shared/graphql/apiTypes.gen";
import {
  GetEntityTypeRootedSubgraphQuery,
  GetEntityTypeRootedSubgraphQueryVariables,
  GetOutgoingPersistedLinksQuery,
  UpdatePersistedEntityMutation,
  UpdatePersistedEntityMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { getEntityTypeRootedSubgraphQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import {
  getOutgoingPersistedLinksQuery,
  updatePersistedEntityMutation,
} from "../../../../graphql/queries/knowledge/entity.queries";
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

  const [getOutgoingLinksFn] = useLazyQuery<
    GetOutgoingPersistedLinksQuery,
    QueryOutgoingPersistedLinksArgs
  >(getOutgoingPersistedLinksQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

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
      const [{ data: updateEntityResponseData }, { data: outgoingLinksData }] =
        await Promise.all([
          updateFn({
            variables: {
              entityId,
              updatedProperties,
            },
          }),
          getOutgoingLinksFn({ variables: { sourceEntityId: entityId } }),
        ]);

      const { updatePersistedEntity: updatedEntity } =
        updateEntityResponseData ?? {};

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
      if (!outgoingLinksData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getOutgoingLinks",
            },
          ],
        };
      }

      const { outgoingPersistedLinks } = outgoingLinksData;

      /**
       * @todo: the EntityTypeRootedSubgraph is not returned from the `updateEntity` mutation.
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
          links: outgoingPersistedLinks,
        },
      };
    },
    [updateFn, readonly, getEntityTypeRootedSubgraphFn, getOutgoingLinksFn],
  );

  return {
    updateEntity: updatePersistedEntity,
  };
};
