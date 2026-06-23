import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { usePropertyTypes } from "../../../../shared/property-types-context";
import { useDataTypesContext } from "../../data-types-context";
import { buildEntitiesFilter } from "./build-filter";
import { deriveFilterableProperties } from "./property-filters/derive-filterable-properties";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { EntitiesFilterState } from "./filter-state";
import type { FilterMetadataForProperty } from "./property-filters/property-filter";
import type { BaseUrl, VersionedUrl, WebId } from "@blockprotocol/type-system";

export type AvailableType = {
  entityTypeId: VersionedUrl;
  title: string;
  count: number;
};

export const useAvailableTypes = ({
  filterState,
  internalWebs,
  entityTypeBaseUrl,
  entityTypeIds,
}: {
  filterState: EntitiesFilterState;
  internalWebs: { webId: WebId }[];
  entityTypeBaseUrl?: BaseUrl;
  entityTypeIds?: VersionedUrl[];
}): {
  availableEntityTypes: AvailableType[];
  propertyFilterData: FilterMetadataForProperty[];
  loading: boolean;
} => {
  const { entityTypes, entityTypeParentIds } = useEntityTypesContextRequired();
  const { dataTypes } = useDataTypesContext();
  const { propertyTypes } = usePropertyTypes();

  const isTypePinned = !!entityTypeBaseUrl || !!entityTypeIds?.length;
  const shouldFetchAvailableTypes = !isTypePinned;

  const pinnedEntityTypeIds = useMemo<VersionedUrl[] | null>(() => {
    if (entityTypeIds?.length) {
      return entityTypeIds;
    }

    if (entityTypeBaseUrl && entityTypes) {
      return entityTypes
        .filter(({ schema }) => extractBaseUrl(schema.$id) === entityTypeBaseUrl)
        .map(({ schema }) => schema.$id);
    }

    return null;
  }, [entityTypeBaseUrl, entityTypeIds, entityTypes]);

  const filter = useMemo(
    () =>
      buildEntitiesFilter({
        filterState: {
          web: filterState.web,
          type: { selectedTypeIds: null },
          includeArchived: filterState.includeArchived,
          propertyFilters: [],
        },
        internalWebIds: internalWebs.map(({ webId }) => webId),
      }),
    [filterState, internalWebs],
  );

  const { data, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    skip: !shouldFetchAvailableTypes,
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

  const { availableEntityTypes, propertyFilterData } = useMemo<{
    availableEntityTypes: AvailableType[];
    propertyFilterData: FilterMetadataForProperty[];
  }>(() => {
    if (shouldFetchAvailableTypes && !data) {
      return { availableEntityTypes: [], propertyFilterData: [] };
    }

    const typeIds = data?.queryEntitySubgraph.typeIds ?? {};
    const typeTitles = data?.queryEntitySubgraph.typeTitles ?? {};

    const availableTypes = Object.entries(typeIds)
      .map(([entityTypeId, count]) => {
        const versionedUrl = entityTypeId as VersionedUrl;
        return {
          entityTypeId: versionedUrl,
          title: typeTitles[versionedUrl] ?? entityTypeId,
          count,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    if (!dataTypes || !entityTypes || !entityTypeParentIds || !propertyTypes) {
      return { availableEntityTypes: availableTypes, propertyFilterData: [] };
    }

    const availableEntityTypeIds = shouldFetchAvailableTypes
      ? (Object.keys(typeIds) as VersionedUrl[])
      : (pinnedEntityTypeIds ?? []);
    const selectedAvailableEntityTypeIds = shouldFetchAvailableTypes
      ? filterState.type.selectedTypeIds
        ? [...filterState.type.selectedTypeIds].filter((typeId) =>
            availableEntityTypeIds.includes(typeId),
          )
        : availableEntityTypeIds
      : availableEntityTypeIds;

    /**
     * The properties offered in the property-filter picker, derived from the
     * selected entity types matching the current result set, including parents.
     */
    const availableProperties = deriveFilterableProperties({
      dataTypes,
      entityTypeIds: selectedAvailableEntityTypeIds,
      entityTypeParentIds,
      entityTypes,
      propertyTypes,
    });

    return {
      availableEntityTypes: availableTypes,
      propertyFilterData: availableProperties,
    };
  }, [
    data,
    dataTypes,
    entityTypeParentIds,
    entityTypes,
    pinnedEntityTypeIds,
    filterState.type.selectedTypeIds,
    propertyTypes,
    shouldFetchAvailableTypes,
  ]);

  const propertyFilterDataLoading =
    !dataTypes || !entityTypes || !entityTypeParentIds || !propertyTypes;

  return {
    availableEntityTypes,
    propertyFilterData,
    loading: shouldFetchAvailableTypes
      ? loading || propertyFilterDataLoading
      : propertyFilterDataLoading,
  };
};
