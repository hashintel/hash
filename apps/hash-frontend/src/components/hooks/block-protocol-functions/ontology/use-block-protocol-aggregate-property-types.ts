import { useLazyQuery } from "@apollo/client";
import { Subgraph, SubgraphRootTypes } from "@local/hash-subgraph";
import { useCallback } from "react";

import {
  GetAllLatestPropertyTypesQuery,
  GetAllLatestPropertyTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getAllLatestPropertyTypesQuery } from "../../../../graphql/queries/ontology/property-type.queries";
import { AggregatePropertyTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolAggregatePropertyTypes = (): {
  aggregatePropertyTypes: AggregatePropertyTypesMessageCallback;
} => {
  const [aggregateFn] = useLazyQuery<
    GetAllLatestPropertyTypesQuery,
    GetAllLatestPropertyTypesQueryVariables
  >(getAllLatestPropertyTypesQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const aggregatePropertyTypes =
    useCallback<AggregatePropertyTypesMessageCallback>(
      async ({ data }) => {
        if (!data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "'data' must be provided for aggregatePropertyTypes",
              },
            ],
          };
        }

        const { graphResolveDepths } = data;
        /**
         * @todo Add filtering to this aggregate query using structural querying.
         *   This may mean having the backend use structural querying and relaying
         *   or doing it from here.
         *   https://app.asana.com/0/1202805690238892/1202890614880643/f
         */
        const response = await aggregateFn({
          variables: {
            constrainsValuesOn: { outgoing: 255 },
            constrainsPropertiesOn: { outgoing: 255 },
            ...graphResolveDepths,
          },
        });

        if (!response.data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "Error calling aggregatePropertyTypes",
              },
            ],
          };
        }

        return {
          /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
          data: response.data.getAllLatestPropertyTypes as Subgraph<
            SubgraphRootTypes["propertyType"]
          >,
        };
      },
      [aggregateFn],
    );

  return { aggregatePropertyTypes };
};
