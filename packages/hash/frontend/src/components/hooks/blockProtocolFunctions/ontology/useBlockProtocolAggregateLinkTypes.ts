import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetAllLatestLinkTypesQuery,
  GetAllLatestLinkTypesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getAllLatestLinkTypesQuery } from "../../../../graphql/queries/ontology/link-type.queries";
import { AggregateLinkTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolAggregateLinkTypes = (): {
  aggregateLinkTypes: AggregateLinkTypeMessageCallback;
} => {
  const [aggregateLinkTypesQuery] = useLazyQuery<
    GetAllLatestLinkTypesQuery,
    GetAllLatestLinkTypesQueryVariables
  >(getAllLatestLinkTypesQuery);

  const aggregateLinkTypes = useCallback<AggregateLinkTypeMessageCallback>(
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

      const response = await aggregateLinkTypesQuery({
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
    [aggregateLinkTypesQuery],
  );

  return { aggregateLinkTypes };
};
