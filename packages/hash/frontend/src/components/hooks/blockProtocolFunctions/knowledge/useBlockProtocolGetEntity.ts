import { useLazyQuery } from "@apollo/client";
import { useCallback } from "react";
import { getEntityTypeRootedSubgraphQuery } from "../../../../graphql/queries/ontology/entity-type.queries";

import {
  GetEntityTypeRootedSubgraphQuery,
  GetEntityTypeRootedSubgraphQueryVariables,
  GetOutgoingPersistedLinksQuery,
  Query,
  QueryOutgoingPersistedLinksArgs,
  QueryPersistedEntityArgs,
} from "../../../../graphql/apiTypes.gen";
import {
  getOutgoingPersistedLinksQuery,
  getPersistedEntityQuery,
} from "../../../../graphql/queries/knowledge/entity.queries";
import { GetEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolGetEntity = (): {
  getEntity: GetEntityMessageCallback;
} => {
  const [getEntityTypeRootedSubgraphFn] = useLazyQuery<
    GetEntityTypeRootedSubgraphQuery,
    GetEntityTypeRootedSubgraphQueryVariables
  >(getEntityTypeRootedSubgraphQuery);

  const [getEntityFn] = useLazyQuery<Query, QueryPersistedEntityArgs>(
    getPersistedEntityQuery,
    {
      /** @todo reconsider caching. This is done for testing/demo purposes. */
      fetchPolicy: "no-cache",
    },
  );

  const [getOutgoingLinksFn] = useLazyQuery<
    GetOutgoingPersistedLinksQuery,
    QueryOutgoingPersistedLinksArgs
  >(getOutgoingPersistedLinksQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

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

      const [{ data: entityResponseData }, { data: outgoingLinksData }] =
        await Promise.all([
          getEntityFn({ variables: { entityId } }),
          getOutgoingLinksFn({ variables: { sourceEntityId: entityId } }),
        ]);

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

      const { persistedEntity } = entityResponseData;
      const { outgoingPersistedLinks } = outgoingLinksData;

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
          entityTypeRootedSubgraph: entityTypeResponseData.getEntityType,
          links: outgoingPersistedLinks,
        },
      };
    },
    [getEntityFn, getEntityTypeRootedSubgraphFn, getOutgoingLinksFn],
  );

  return { getEntity };
};
