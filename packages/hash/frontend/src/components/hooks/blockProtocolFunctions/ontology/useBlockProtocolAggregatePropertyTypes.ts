import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetAllLatestPropertyTypesQuery,
  GetAllLatestPropertyTypesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
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

        /**
         * @todo Add filtering to this aggregate query using structural querying.
         *   This may mean having the backend use structural querying and relaying
         *   or doing it from here.
         *   https://app.asana.com/0/1202805690238892/1202890614880643/f
         */
        const response = await aggregateFn({
          variables: {
            dataTypeResolveDepth: 255,
            propertyTypeResolveDepth: 255,
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

        return { data: response.data.getAllLatestPropertyTypes };
      },
      [aggregateFn],
    );

  return { aggregatePropertyTypes };
};
