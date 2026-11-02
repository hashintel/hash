import { useQuery } from "@apollo/client";

import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntityTypesQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type { BaseUrl } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";

const useQueryEntityTypes = (filter: Filter, skip: boolean) =>
  useQuery<QueryEntityTypesQuery, QueryEntityTypesQueryVariables>(
    queryEntityTypesQuery,
    {
      fetchPolicy: "cache-and-network",
      skip,
      variables: {
        request: { filter, temporalAxes: currentTimeInstantTemporalAxes },
      },
    },
  );

/**
 * Loads the types whose own `allOf` names any version of the given type, in two
 * parallel queries: every version of them, and the latest version of each one
 * whose latest version extends the given type.
 */
export const useDependentTypes = (entityTypeBaseUrl: BaseUrl | null) => {
  const extendsEntityType: Filter = {
    equal: [
      { path: ["inheritsFrom(inheritanceDepth=0)", "*", "baseUrl"] },
      { parameter: entityTypeBaseUrl },
    ],
  };

  const allVersions = useQueryEntityTypes(
    extendsEntityType,
    !entityTypeBaseUrl,
  );
  const latestVersions = useQueryEntityTypes(
    {
      all: [
        extendsEntityType,
        { equal: [{ path: ["version"] }, { parameter: "latest" }] },
      ],
    },
    !entityTypeBaseUrl,
  );

  return {
    data:
      allVersions.data && latestVersions.data
        ? {
            allVersions: allVersions.data.queryEntityTypes,
            latestVersions: latestVersions.data.queryEntityTypes,
          }
        : undefined,
    error: allVersions.error ?? latestVersions.error,
  };
};
