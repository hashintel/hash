import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetLinkTypeQuery,
  GetLinkTypeQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getLinkTypeQuery } from "../../../../graphql/queries/ontology/link-type.queries";
import { GetLinkTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetLinkType = (): {
  aggregateLinkTypes: GetLinkTypeMessageCallback;
} => {
  const [aggregateLinkTypesQuery] = useLazyQuery<
    GetLinkTypeQuery,
    GetLinkTypeQueryVariables
  >(getLinkTypeQuery);

  const aggregateLinkTypes = useCallback<GetLinkTypeMessageCallback>(
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
        query: getLinkTypeQuery,
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
        data: response.data.getLinkType,
      };
    },
    [aggregateLinkTypesQuery],
  );

  return { aggregateLinkTypes };
};
