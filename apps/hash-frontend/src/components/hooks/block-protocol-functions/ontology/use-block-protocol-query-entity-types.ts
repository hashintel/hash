import { useLazyQuery } from "@apollo/client";
import { EntityTypeRootType, Subgraph } from "@local/hash-subgraph";
import { useCallback } from "react";

import {
  GetAllLatestEntityTypesQuery,
  GetAllLatestEntityTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getAllLatestEntityTypesQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { QueryEntityTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolQueryEntityTypes = (): {
  queryEntityTypes: QueryEntityTypesMessageCallback;
} => {
  const [queryFn] = useLazyQuery<
    GetAllLatestEntityTypesQuery,
    GetAllLatestEntityTypesQueryVariables
  >(getAllLatestEntityTypesQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const queryEntityTypes = useCallback<QueryEntityTypesMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for queryEntityTypes",
            },
          ],
        };
      }

      const { graphResolveDepths } = data;

      /**
       * @todo Add filtering to this query using structural querying.
       *   This may mean having the backend use structural querying and relaying
       *   or doing it from here.
       *   https://app.asana.com/0/1202805690238892/1202890614880643/f
       */
      const response = await queryFn({
        variables: {
          constrainsValuesOn: { outgoing: 255 },
          constrainsPropertiesOn: { outgoing: 255 },
          constrainsLinksOn: { outgoing: 1 },
          constrainsLinkDestinationsOn: { outgoing: 1 },
          ...graphResolveDepths,
        },
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling queryEntityTypes",
            },
          ],
        };
      }

      return {
        /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
        data: response.data
          .getAllLatestEntityTypes as Subgraph<EntityTypeRootType>,
      };
    },
    [queryFn],
  );

  return { queryEntityTypes };
};
