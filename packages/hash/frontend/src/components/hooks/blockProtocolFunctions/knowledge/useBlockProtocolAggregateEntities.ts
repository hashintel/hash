import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetAllLatestPersistedEntitiesQuery,
  GetAllLatestPersistedEntitiesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getAllLatestEntitiesQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { AggregateEntitiesMessageCallback, Entity } from "./knowledge-shim";
import { Subgraph } from "../../../../lib/subgraph";

export const useBlockProtocolAggregateEntities = (): {
  aggregateEntities: AggregateEntitiesMessageCallback;
} => {
  const [aggregateFn] = useLazyQuery<
    GetAllLatestPersistedEntitiesQuery,
    GetAllLatestPersistedEntitiesQueryVariables
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
          dataTypeResolveDepth: 255,
          propertyTypeResolveDepth: 255,
          linkTypeResolveDepth: 255,
          // Only get the direct and absolute neighbor entity types
          entityTypeResolveDepth: 2,
          // Only get absolute neighbor entities
          linkResolveDepth: 1,
          linkTargetEntityResolveDepth: 1,
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

      const { getAllLatestPersistedEntities: subgraph } = response;

      /**
       * @todo: remove this when we start returning links in the subgraph
       *   https://app.asana.com/0/0/1203214689883095/f
       */
      for (const [_, vertex] of Object.entries(subgraph.vertices)) {
        if (vertex.kind === "entity") {
          (vertex.inner as unknown as Entity).links = [];
        }
      }

      /**
       * @todo: remove this when we start returning links in the subgraph
       *   https://app.asana.com/0/0/1203214689883095/f
       */
      return {
        data: subgraph as Subgraph,
      };
    },
    [aggregateFn],
  );

  return { aggregateEntities };
};
