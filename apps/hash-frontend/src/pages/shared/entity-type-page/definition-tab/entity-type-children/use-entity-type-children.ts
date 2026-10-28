import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntityTypesQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type { BaseUrl } from "@blockprotocol/type-system";

export const useEntityTypeChildren = (entityTypeBaseUrl: BaseUrl | null) => {
  const { data, error } = useQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    fetchPolicy: "cache-and-network",
    skip: !entityTypeBaseUrl,
    variables: {
      request: {
        filter: {
          all: [
            {
              equal: [
                { path: ["inheritsFrom(inheritanceDepth=0)", "*", "baseUrl"] },
                { parameter: entityTypeBaseUrl },
              ],
            },
            { equal: [{ path: ["version"] }, { parameter: "latest" }] },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
  });

  const children = useMemo(() => {
    if (!data || !entityTypeBaseUrl) {
      return undefined;
    }

    // The Graph does not deduplicate the rows this filter matches.
    const childrenByBaseUrl = new Map(
      data.queryEntityTypes.entityTypes.map((entityType) => [
        entityType.metadata.recordId.baseUrl,
        entityType,
      ]),
    );
    childrenByBaseUrl.delete(entityTypeBaseUrl);

    return [...childrenByBaseUrl.values()].sort((left, right) =>
      left.schema.title.localeCompare(right.schema.title),
    );
  }, [data, entityTypeBaseUrl]);

  return { children, error };
};
