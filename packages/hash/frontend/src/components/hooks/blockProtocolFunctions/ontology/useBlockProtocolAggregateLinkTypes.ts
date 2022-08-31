import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetAllLatestLinkTypesQuery,
  GetAllLatestLinkTypesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getAllLatestLinkTypesQuery } from "../../../../graphql/queries/ontology/link-type.queries";
import { AggregateLinkTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolAggregateLinkTypes = (): {
  aggregateLinkTypes: AggregateLinkTypesMessageCallback;
} => {
  const [aggregateFn] = useLazyQuery<
    GetAllLatestLinkTypesQuery,
    GetAllLatestLinkTypesQueryVariables
  >(getAllLatestLinkTypesQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const aggregateLinkTypes = useCallback<AggregateLinkTypesMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for aggregateLinkTypes",
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
        query: getAllLatestLinkTypesQuery,
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling aggregateLinkTypes",
            },
          ],
        };
      }

      return {
        data: {
          results: response.data.getAllLatestLinkTypes,
        },
      };
    },
    [aggregateFn],
  );

  return { aggregateLinkTypes };
};
