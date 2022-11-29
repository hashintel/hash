import { useLazyQuery } from "@apollo/client";
import { useCallback } from "react";

import { Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getEntityQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { GetEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolGetEntity = (): {
  getEntity: GetEntityMessageCallback;
} => {
  const [getEntityFn] = useLazyQuery<GetEntityQuery, GetEntityQueryVariables>(
    getEntityQuery,
    {
      /** @todo reconsider caching. This is done for testing/demo purposes. */
      fetchPolicy: "no-cache",
    },
  );

  const getEntity = useCallback<GetEntityMessageCallback>(
    async ({ data: entityId }) => {
      if (!entityId) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getEntity",
            },
          ],
        };
      }

      const { data: response } = await getEntityFn({
        variables: {
          entityId,
          constrainsValuesOn: { outgoing: 255 },
          constrainsPropertiesOn: { outgoing: 255 },
          constrainsLinksOn: { outgoing: 1 },
          constrainsLinkDestinationsOn: { outgoing: 1 },
          isOfType: { outgoing: 1 },
          hasLeftEntity: { outgoing: 1, incoming: 1 },
          hasRightEntity: { outgoing: 1, incoming: 1 },
        },
      });

      if (!response) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getEntity",
            },
          ],
        };
      }

      return {
        /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
        data: response.getEntity as Subgraph<SubgraphRootTypes["entity"]>,
      };
    },
    [getEntityFn],
  );

  return { getEntity };
};
