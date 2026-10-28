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
    if (!data) {
      return undefined;
    }

    const childrenByTypeId = new Map(
      data.queryEntityTypes.entityTypes
        .filter(
          (entityType) =>
            entityType.metadata.recordId.baseUrl !== entityTypeBaseUrl,
        )
        .map((entityType) => [entityType.schema.$id, entityType]),
    );

    return [...childrenByTypeId.values()].sort((left, right) =>
      left.schema.title.localeCompare(right.schema.title),
    );
  }, [data, entityTypeBaseUrl]);

  return { children, error };
};
