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
      // Entity types are immutable, any request for an entityTypeId should always return the same value.
      fetchPolicy: "cache-first",
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

      const { entityTypeId } = data;

      const response = await getFn({
        query: getEntityTypeQuery,
        variables: { entityTypeId },
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
