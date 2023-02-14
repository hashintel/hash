import { useLazyQuery } from "@apollo/client";
import { Subgraph, SubgraphRootTypes } from "@local/hash-subgraph/main";
import { useCallback } from "react";

import {
  GetAllLatestEntitiesQuery,
  GetAllLatestEntitiesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getAllLatestEntitiesQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { AggregateEntitiesMessageCallback } from "./knowledge-shim";

export const useBlockProtocolAggregateEntities = (): {
  aggregateEntities: AggregateEntitiesMessageCallback;
} => {
  const [aggregateFn] = useLazyQuery<
    GetAllLatestEntitiesQuery,
    GetAllLatestEntitiesQueryVariables
  >(getAllLatestEntitiesQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const aggregateEntities = useCallback<AggregateEntitiesMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for aggregateEntities",
            },
          ],
        };
      }

      const { rootEntityTypeIds, graphResolveDepths } = data;

      /**
       * @todo Add filtering to this aggregate query using structural querying.
       *   This may mean having the backend use structural querying and relaying
       *   or doing it from here.
       *   https://app.asana.com/0/1202805690238892/1202890614880643/f
       */
      const { data: response } = await aggregateFn({
        variables: {
          rootEntityTypeIds,
          constrainsValuesOn: { outgoing: 255 },
          constrainsPropertiesOn: { outgoing: 255 },
          constrainsLinksOn: { outgoing: 1 },
          constrainsLinkDestinationsOn: { outgoing: 1 },
          isOfType: { outgoing: 1 },
          hasLeftEntity: { outgoing: 1, incoming: 1 },
          hasRightEntity: { outgoing: 1, incoming: 1 },
          ...graphResolveDepths,
        },
      });

      if (!response) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling aggregateEntities",
            },
          ],
        };
      }

      return {
        /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
        data: response.getAllLatestEntities as Subgraph<
          SubgraphRootTypes["entity"]
        >,
      };
    },
    [aggregateFn],
  );

  return { aggregateEntities };
};
