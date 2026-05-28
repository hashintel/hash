import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { buildEntitiesFilter } from "./build-filter";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { EntitiesFilterState } from "./types";
import type { BaseUrl, VersionedUrl, WebId } from "@blockprotocol/type-system";

export type AvailableType = {
  entityTypeId: VersionedUrl;
  title: string;
  count: number;
};

/**
 * Drives the option list for the type-filter pill. Runs a minimal subgraph
 * request that applies the current web + archived filters but deliberately
 * ignores the user's type filter -- otherwise unchecking a type would remove
 * it from the dropdown and the user could never re-check it.
 *
 * Skipped entirely when the visualizer's type is pinned by route prop, since
 * the pill is not rendered in that case.
 */
export const useAvailableTypes = ({
  filterState,
  internalWebIds,
  entityTypeBaseUrl,
  entityTypeIds,
}: {
  filterState: EntitiesFilterState;
  internalWebIds: WebId[];
  entityTypeBaseUrl?: BaseUrl;
  entityTypeIds?: VersionedUrl[];
}): { types: AvailableType[]; loading: boolean } => {
  const skip = !!entityTypeBaseUrl || !!entityTypeIds?.length;

  const filterStateWithoutType = useMemo<EntitiesFilterState>(
    () => ({
      ...filterState,
      type: { selectedTypeIds: null },
    }),
    [filterState],
  );

  const filter = useMemo(
    () =>
      buildEntitiesFilter({
        filterState: filterStateWithoutType,
        internalWebIds,
      }),
    [filterStateWithoutType, internalWebIds],
  );

  const { data, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    skip,
    fetchPolicy: "cache-and-network",
    variables: {
      request: {
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

  return { types, loading: skip ? false : loading };
};
