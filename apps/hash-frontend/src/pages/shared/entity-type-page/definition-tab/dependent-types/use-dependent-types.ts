import { useQuery } from "@apollo/client";

import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryDependentEntityTypesQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";

import type {
  QueryDependentEntityTypesQuery,
  QueryDependentEntityTypesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type { BaseUrl } from "@blockprotocol/type-system";

/**
 * Loads the types whose own `allOf` names any version of the given type: every
 * version of them, and the latest version of each one whose latest version
 * extends the given type.
 */
export const useDependentTypes = (entityTypeBaseUrl: BaseUrl | null) => {
  const extendsEntityType = {
    equal: [
      { path: ["inheritsFrom(inheritanceDepth=0)", "*", "baseUrl"] },
      { parameter: entityTypeBaseUrl },
    ],
  };

  const { data, error } = useQuery<
    QueryDependentEntityTypesQuery,
    QueryDependentEntityTypesQueryVariables
  >(queryDependentEntityTypesQuery, {
    fetchPolicy: "cache-and-network",
    skip: !entityTypeBaseUrl,
    variables: {
      allVersions: {
        filter: extendsEntityType,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
      latestVersions: {
        filter: {
          all: [
            extendsEntityType,
            { equal: [{ path: ["version"] }, { parameter: "latest" }] },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
  });

  return { data, error };
};
