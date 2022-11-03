import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetAllLatestLinkTypesQuery,
  GetAllLatestLinkTypesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getAllLatestLinkTypesQuery } from "../../../../graphql/queries/ontology/link-type.queries";
import { AggregateLinkTypesMessageCallback } from "./ontology-types-shim";
import { Subgraph } from "../../../../lib/subgraph";

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
      const response = await aggregateFn({});

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
        /**
         * @todo: remove this when we start returning links in the subgraph
         *   https://app.asana.com/0/0/1203214689883095/f
         */
        data: response.data.getAllLatestLinkTypes as Subgraph,
      };
    },
    [aggregateFn],
  );

  return { aggregateLinkTypes };
};
