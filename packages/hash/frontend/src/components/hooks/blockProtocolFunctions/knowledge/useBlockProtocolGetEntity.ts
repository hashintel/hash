import { useLazyQuery } from "@apollo/client";
import { useCallback } from "react";
import { getEntityTypeRootedSubgraphQuery } from "../../../../graphql/queries/ontology/entity-type.queries";

import {
  GetEntityTypeRootedSubgraphQuery,
  GetEntityTypeRootedSubgraphQueryVariables,
  Query,
  QueryPersistedEntityArgs,
} from "../../../../graphql/apiTypes.gen";
import { getPersistedEntity } from "../../../../graphql/queries/knowledge/entity.queries";
import { GetEntityMessageCallback } from "./knowledge-shim";
import { convertApiEntityToBpEntity } from "../../../../lib/entities";

export const useBlockProtocolGetEntity = (): {
  getEntity: GetEntityMessageCallback;
} => {
  const [getEntityTypeRootedSubgraphFn] = useLazyQuery<
    GetEntityTypeRootedSubgraphQuery,
    GetEntityTypeRootedSubgraphQueryVariables
  >(getEntityTypeRootedSubgraphQuery);

  const [getEntityFn] = useLazyQuery<Query, QueryPersistedEntityArgs>(
    getPersistedEntity,
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
        query: getPersistedEntity,
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

      const { persistedEntity } = entityResponseData;

      /**
       * @todo: obtain this sub-graph as part of the prior `getEntity` query.
       * May be addressed as part of https://app.asana.com/0/1200211978612931/1203089535761796/f or related work.
       */

      const { data: entityTypeResponseData } =
        await getEntityTypeRootedSubgraphFn({
          query: getEntityTypeRootedSubgraphQuery,
          variables: {
            entityTypeId: persistedEntity.entityTypeId,
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
          ...persistedEntity,
          ...convertApiEntityToBpEntity(persistedEntity),
          entityTypeRootedSubgraph: entityTypeResponseData.getEntityType,
        },
      };
    },
    [getEntityFn, getEntityTypeRootedSubgraphFn],
  );

  return { getEntity };
};
