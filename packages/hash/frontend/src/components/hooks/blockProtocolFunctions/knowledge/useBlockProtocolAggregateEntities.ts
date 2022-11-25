import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import { Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import {
  GetAllLatestEntitiesQuery,
  GetAllLatestEntitiesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
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

      /**
       * @todo Add filtering to this aggregate query using structural querying.
       *   This may mean having the backend use structural querying and relaying
       *   or doing it from here.
       *   https://app.asana.com/0/1202805690238892/1202890614880643/f
       */
      const { data: response } = await aggregateFn({
        variables: {
          constrainsValuesOn: 255,
          constrainsPropertiesOn: 255,
          // Only get the direct and absolute neighbor entity types
          constrainsLinksOn: 2,
          // Only get absolute neighbor link entities and their endpoint entities
          entityResolveDepth: 2,
          ...data,
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
