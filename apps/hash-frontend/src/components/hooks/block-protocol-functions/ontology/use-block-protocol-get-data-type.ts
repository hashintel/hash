import { useLazyQuery } from "@apollo/client";
import { Subgraph, SubgraphRootTypes } from "../hash-subgraph/src";
import { useCallback } from "react";

import {
  GetDataTypeQuery,
  GetDataTypeQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getDataTypeQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import { GetDataTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetDataType = (): {
  getDataType: GetDataTypeMessageCallback;
} => {
  const [getFn] = useLazyQuery<GetDataTypeQuery, GetDataTypeQueryVariables>(
    getDataTypeQuery,
    {
      // Data types are immutable, any request for an dataTypeId should always return the same value.
      fetchPolicy: "cache-first",
    },
  );

  const getDataType = useCallback<GetDataTypeMessageCallback>(
    async ({ data: dataTypeId }) => {
      if (!dataTypeId) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getDataType",
            },
          ],
        };
      }

      const response = await getFn({
        variables: {
          dataTypeId,
          constrainsValuesOn: { outgoing: 255 },
        },
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getDataType",
            },
          ],
        };
      }

      return {
        /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
        data: response.data.getDataType as Subgraph<
          SubgraphRootTypes["dataType"]
        >,
      };
    },
    [getFn],
  );

  return { getDataType };
};
