import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import {
  currentTimeInstantTemporalAxes,
  ignoreNoisySystemTypesFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";

import type {
  BaseUrl,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { Filter } from "@local/hash-graph-client";

export type AvailableType = {
  entityTypeId: VersionedUrl;
  title: string;
  count: number;
};

/**
 * Drives the options shown in the "Type is" pill -- the query must not be
 * narrowed by the type filter itself, otherwise the user can never re-check a
 * type they've unchecked.
 */
export const useAvailableTypes = ({
  internalWebIds,
  selectedInternalWebIds,
  includeOtherWebs,
  entityTypeBaseUrl,
  entityTypeIds,
}: {
  internalWebIds: WebId[];
  selectedInternalWebIds: Set<WebId>;
  includeOtherWebs: boolean;
  entityTypeBaseUrl?: BaseUrl;
  entityTypeIds?: VersionedUrl[];
}): { types: AvailableType[]; loading: boolean } => {
  const skip = !!entityTypeBaseUrl || !!entityTypeIds?.length;

  const filter = useMemo<Filter>(() => {
    const clauses: Filter[] = [];

    if (!includeOtherWebs) {
      const ids = [...selectedInternalWebIds];
      if (ids.length === 0) {
        // Valid-format UUID that cannot match any real web -- ensures the
        // Graph parses the request rather than rejecting an invalid parameter.
        clauses.push({
          equal: [
            { path: ["webId"] },
            {
              parameter:
                "00000000-0000-0000-0000-000000000000" as WebId,
            },
          ],
        });
      } else {
        clauses.push({
          any: ids.map((webId) => ({
            equal: [{ path: ["webId"] }, { parameter: webId }],
          })),
        });
      }
    } else {
      const excluded = internalWebIds.filter(
        (webId) => !selectedInternalWebIds.has(webId),
      );
      if (excluded.length > 0) {
        clauses.push({
          all: excluded.map((webId) => ({
            notEqual: [{ path: ["webId"] }, { parameter: webId }],
          })),
        });
      }
    }

    clauses.push({ notEqual: [{ path: ["archived"] }, { parameter: true }] });
    clauses.push({
      any: [
        {
          exists: {
            path: [
              "properties",
              systemPropertyTypes.archived.propertyTypeBaseUrl,
            ],
          },
        },
        {
          equal: [
            {
              path: [
                "properties",
                systemPropertyTypes.archived.propertyTypeBaseUrl,
              ],
            },
            { parameter: false },
          ],
        },
      ],
    });

    clauses.push(ignoreNoisySystemTypesFilter);

    return { all: clauses };
  }, [
    internalWebIds,
    selectedInternalWebIds,
    includeOtherWebs,
  ]);

  const { data, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    skip,
    fetchPolicy: "cache-and-network",
    variables: {
      request: {
        /**
         * Graph rejects a limit of 0, but we don't need any entities -- we
         * only want the includeTypeIds + includeTypeTitles aggregations.
         */
        limit: 1,
        filter,
        includeTypeIds: true,
        includeTypeTitles: true,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
        traversalPaths: [],
      },
    },
  });

  const types = useMemo<AvailableType[]>(() => {
    if (skip || !data) {
      return [];
    }
    const typeIds = data.queryEntitySubgraph.typeIds ?? {};
    const typeTitles = data.queryEntitySubgraph.typeTitles ?? {};
    return Object.entries(typeIds)
      .map(([entityTypeId, count]) => {
        const versionedUrl = entityTypeId as VersionedUrl;
        return {
          entityTypeId: versionedUrl,
          title: typeTitles[versionedUrl] ?? entityTypeId,
          count,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [data, skip]);

  return { types, loading };
};
