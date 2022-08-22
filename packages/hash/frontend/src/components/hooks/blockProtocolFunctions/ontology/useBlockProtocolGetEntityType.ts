import { useLazyQuery } from "@apollo/client";

import { useCallback } from "react";
import {
  GetEntityTypeQuery,
  GetEntityTypeQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { getEntityTypeQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { GetEntityTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetEntityType = (): {
  aggregateEntityTypes: GetEntityTypeMessageCallback;
} => {
  const [aggregateEntityTypesQuery] = useLazyQuery<
    GetEntityTypeQuery,
    GetEntityTypeQueryVariables
  >(getEntityTypeQuery);

  const aggregateEntityTypes = useCallback<GetEntityTypeMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for aggregateEntityTypes",
            },
          ],
        };
      }

      const response = await aggregateEntityTypesQuery({
        query: getEntityTypeQuery,
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling aggregateEntityTypes",
            },
          ],
        };
      }

      return {
        data: response.data.getEntityType,
      };
    },
    [aggregateEntityTypesQuery],
  );

  return { aggregateEntityTypes };
};
