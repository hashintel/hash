import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetLinkTypeQuery,
  GetLinkTypeQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getLinkTypeQuery } from "../../../../graphql/queries/ontology/link-type.queries";
import { GetLinkTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetLinkType = (): {
  getLinkType: GetLinkTypeMessageCallback;
} => {
  const [getFn] = useLazyQuery<GetLinkTypeQuery, GetLinkTypeQueryVariables>(
    getLinkTypeQuery,
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

      const response = await getFn({
        query: getLinkTypeQuery,
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
        data: response.data.getLinkType,
      };
    },
    [getFn],
  );

  return { getLinkType };
};
