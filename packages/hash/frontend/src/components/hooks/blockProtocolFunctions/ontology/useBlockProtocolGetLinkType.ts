import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetLinkTypeQuery,
  GetLinkTypeQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getLinkTypeQuery } from "../../../../graphql/queries/ontology/link-type.queries";
import { GetLinkTypeMessageCallback } from "./ontology-types-shim";
import { Subgraph } from "../../../../lib/subgraph";

export const useBlockProtocolGetLinkType = (): {
  getLinkType: GetLinkTypeMessageCallback;
} => {
  const [getFn] = useLazyQuery<GetLinkTypeQuery, GetLinkTypeQueryVariables>(
    getLinkTypeQuery,
    {
      // Link types are immutable, any request for an linkTypeId should always return the same value.
      fetchPolicy: "cache-first",
    },
  );

  const getLinkType = useCallback<GetLinkTypeMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getLinkType",
            },
          ],
        };
      }

      const { linkTypeId } = data;

      const response = await getFn({
        variables: { linkTypeId },
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getLinkType",
            },
          ],
        };
      }

      return {
        /**
         * @todo: remove this when we start returning links in the subgraph
         *   https://app.asana.com/0/0/1203214689883095/f
         */
        data: response.data.getLinkType as Subgraph,
      };
    },
    [getFn],
  );

  return { getLinkType };
};
