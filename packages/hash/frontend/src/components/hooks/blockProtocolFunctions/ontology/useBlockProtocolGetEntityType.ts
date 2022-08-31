import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetEntityTypeQuery,
  GetEntityTypeQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getEntityTypeQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { GetEntityTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetEntityType = (): {
  getEntityType: GetEntityTypeMessageCallback;
} => {
  const [getFn] = useLazyQuery<GetEntityTypeQuery, GetEntityTypeQueryVariables>(
    getEntityTypeQuery,
    {
      /** @todo reconsider caching. This is done for testing/demo purposes. */
      fetchPolicy: "no-cache",
    },
  );

  const getEntityType = useCallback<GetEntityTypeMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getEntityType",
            },
          ],
        };
      }

      const response = await getFn({
        query: getEntityTypeQuery,
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getEntityType",
            },
          ],
        };
      }

      return {
        data: response.data.getEntityType,
      };
    },
    [getFn],
  );

  return { getEntityType };
};
