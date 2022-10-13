import { useLazyQuery, useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  GetEntityTypeRootedSubgraphQuery,
  GetEntityTypeRootedSubgraphQueryVariables,
  CreatePersistedEntityMutation,
  CreatePersistedEntityMutationVariables,
  GetOutgoingPersistedLinksQuery,
  QueryOutgoingPersistedLinksArgs,
} from "../../../../graphql/apiTypes.gen";
import { getEntityTypeRootedSubgraphQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import {
  createPersistedEntityMutation,
  getOutgoingPersistedLinksQuery,
} from "../../../../graphql/queries/knowledge/entity.queries";
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

  const [getOutgoingLinksFn] = useLazyQuery<
    GetOutgoingPersistedLinksQuery,
    QueryOutgoingPersistedLinksArgs
  >(getOutgoingPersistedLinksQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

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

      const { data: createEntityResponseData } = await createFn({
        variables: {
          entityTypeId,
          properties,
        },
      });

      const { createPersistedEntity: createdEntity } =
        createEntityResponseData ?? {};

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

      const [{ data: entityTypeResponseData }, { data: outgoingLinksData }] =
        await Promise.all([
          getEntityTypeRootedSubgraphFn({
            variables: {
              entityTypeId: createdEntity.entityTypeId,
            },
          }),
          getOutgoingLinksFn({
            variables: { sourceEntityId: createdEntity.entityId },
          }),
        ]);

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

      return {
        data: {
          ...createdEntity,
          entityTypeRootedSubgraph: entityTypeResponseData.getEntityType,
          links: outgoingPersistedLinks,
        },
      };
    },
    [createFn, readonly, getEntityTypeRootedSubgraphFn, getOutgoingLinksFn],
  );

  return {
    createEntity: createPersistedEntity,
  };
};
