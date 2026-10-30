import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import {
  compareOntologyTypeVersions,
  extractBaseUrl,
} from "@blockprotocol/type-system";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntityTypesQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

export const useEntityTypeChildren = (entityTypeId: VersionedUrl | null) => {
  const { data, error } = useQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    fetchPolicy: "cache-and-network",
    skip: !entityTypeId,
    variables: {
      request: {
        filter: {
          equal: [
            {
              path: ["inheritsFrom(inheritanceDepth=0)", "*", "versionedUrl"],
            },
            { parameter: entityTypeId },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
  });

  const children = useMemo(() => {
    if (!data || !entityTypeId) {
      return undefined;
    }

    // The filter matches every version of a child that extends this version.
    const newestByBaseUrl = new Map<BaseUrl, EntityTypeWithMetadata>();
    for (const entityType of data.queryEntityTypes.entityTypes) {
      const { baseUrl, version } = entityType.metadata.recordId;
      const newest = newestByBaseUrl.get(baseUrl);

      if (
        !newest ||
        compareOntologyTypeVersions(version, newest.metadata.recordId.version) >
          0
      ) {
        newestByBaseUrl.set(baseUrl, entityType);
      }
    }
    newestByBaseUrl.delete(extractBaseUrl(entityTypeId));

    return [...newestByBaseUrl.values()].sort((left, right) =>
      left.schema.title.localeCompare(right.schema.title),
    );
  }, [data, entityTypeId]);

  return { children, error };
};
