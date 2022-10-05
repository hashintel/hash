import { useLazyQuery } from "@apollo/client";
import { useCallback } from "react";
import { getEntityTypeRootedSubgraphQuery } from "../../../../graphql/queries/ontology/entity-type.queries";

import {
  GetEntityTypeRootedSubgraphQuery,
  GetEntityTypeRootedSubgraphQueryVariables,
  Query,
  QueryKnowledgeEntityArgs,
} from "../../../../graphql/apiTypes.gen";
import { getKnowledgeEntity } from "../../../../graphql/queries/knowledge/entity.queries";
import { GetEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolGetEntity = (): {
  getEntity: GetEntityMessageCallback;
} => {
  const [getEntityTypeRootedSubgraphFn] = useLazyQuery<
    GetEntityTypeRootedSubgraphQuery,
    GetEntityTypeRootedSubgraphQueryVariables
  >(getEntityTypeRootedSubgraphQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const [getEntityFn] = useLazyQuery<Query, QueryKnowledgeEntityArgs>(
    getKnowledgeEntity,
    {
      /** @todo reconsider caching. This is done for testing/demo purposes. */
      fetchPolicy: "no-cache",
    },
  );

  const getEntity = useCallback<GetEntityMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getEntity",
            },
          ],
        };
      }

      const { entityId } = data;

      const { data: entityResponseData } = await getEntityFn({
        query: getKnowledgeEntity,
        variables: { entityId },
      });

      if (!entityResponseData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getEntity",
            },
          ],
        };
      }

      const { knowledgeEntity } = entityResponseData;

      const { data: entityTypeResponseData } =
        await getEntityTypeRootedSubgraphFn({
          query: getEntityTypeRootedSubgraphQuery,
          variables: {
            entityTypeId: knowledgeEntity.entityTypeId,
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
          ...knowledgeEntity,
          entityTypeRootedSubgraph: entityTypeResponseData.getEntityType,
        },
      };
    },
    [getEntityFn, getEntityTypeRootedSubgraphFn],
  );

  return { getEntity };
};
