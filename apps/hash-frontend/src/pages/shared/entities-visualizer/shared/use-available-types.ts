import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { summarizeEntitiesQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { usePropertyTypes } from "../../../../shared/property-types-context";
import { useDataTypesContext } from "../../data-types-context";
import { buildEntitiesFilter } from "./build-filter";
import { deriveFilterableProperties } from "./property-filters/derive-filterable-properties";

import type {
  SummarizeEntitiesQuery,
  SummarizeEntitiesQueryVariables,
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
  /**
   * The available entity types that are link (relationship) types. The graph
   * view hides these from the filter bar — its nodes are non-link entities and
   * its edges aren't filterable — while callers keep the full type list so a
   * link selection made in the table view survives a switch to the graph.
   */
  linkEntityTypeIds: Set<VersionedUrl>;
  /**
   * Filterable property base URLs found only on link types (never on a non-link
   * type). Hidden from the graph view's property picker for the same reason.
   */
  linkOnlyPropertyBaseUrls: Set<BaseUrl>;
  loading: boolean;
} => {
  const { entityTypes, entityTypeParentIds, isSpecialEntityTypeLookup } =
    useEntityTypesContextRequired();
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
        .filter(
          ({ schema }) => extractBaseUrl(schema.$id) === entityTypeBaseUrl,
        )
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
    SummarizeEntitiesQuery,
    SummarizeEntitiesQueryVariables
  >(summarizeEntitiesQuery, {
    skip: !shouldFetchAvailableTypes,
    fetchPolicy: "cache-and-network",
    variables: {
      request: {
        filter,
        includeTypeIds: true,
        includeTypeTitles: true,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    },
  });

  const { availableEntityTypes, propertyFilterData, linkInfo } = useMemo<{
    availableEntityTypes: AvailableType[];
    propertyFilterData: FilterMetadataForProperty[];
    linkInfo: {
      linkEntityTypeIds: Set<VersionedUrl>;
      linkOnlyPropertyBaseUrls: Set<BaseUrl>;
    };
  }>(() => {
    const emptyLinkInfo = {
      linkEntityTypeIds: new Set<VersionedUrl>(),
      linkOnlyPropertyBaseUrls: new Set<BaseUrl>(),
    };

    if (shouldFetchAvailableTypes && !data) {
      return {
        availableEntityTypes: [],
        propertyFilterData: [],
        linkInfo: emptyLinkInfo,
      };
    }

    const typeIds = data?.summarizeEntities.typeIds ?? {};
    const typeTitles = data?.summarizeEntities.typeTitles ?? {};

    // Until the special-type lookup loads, every type reads as non-link, so link
    // types are classified only transiently before the first resolved render.
    const isLinkType = (entityTypeId: VersionedUrl): boolean =>
      isSpecialEntityTypeLookup?.[entityTypeId]?.isLink ?? false;

    // The full type list — link types included. Callers hide link types from the
    // graph filter bar for display, but the selection state (and the pruning that
    // keeps it consistent) works against the full list so a link filter set in
    // the table view is not silently dropped when the graph view is opened.
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

    const availableEntityTypeIds = shouldFetchAvailableTypes
      ? (Object.keys(typeIds) as VersionedUrl[])
      : (pinnedEntityTypeIds ?? []);

    const linkEntityTypeIds = new Set(
      availableEntityTypeIds.filter(isLinkType),
    );

    if (!dataTypes || !entityTypes || !entityTypeParentIds || !propertyTypes) {
      return {
        availableEntityTypes: availableTypes,
        propertyFilterData: [],
        linkInfo: { linkEntityTypeIds, linkOnlyPropertyBaseUrls: new Set() },
      };
    }

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

    // A property is "link-only" when it survives the derivation over all selected
    // types but not over the non-link ones — i.e. no non-link type carries it.
    const nonLinkPropertyBaseUrls = new Set(
      deriveFilterableProperties({
        dataTypes,
        entityTypeIds: selectedAvailableEntityTypeIds.filter(
          (typeId) => !linkEntityTypeIds.has(typeId),
        ),
        entityTypeParentIds,
        entityTypes,
        propertyTypes,
      }).map(({ baseUrl }) => baseUrl),
    );
    const linkOnlyPropertyBaseUrls = new Set(
      availableProperties
        .map(({ baseUrl }) => baseUrl)
        .filter((baseUrl) => !nonLinkPropertyBaseUrls.has(baseUrl)),
    );

    return {
      availableEntityTypes: availableTypes,
      propertyFilterData: availableProperties,
      linkInfo: { linkEntityTypeIds, linkOnlyPropertyBaseUrls },
    };
  }, [
    data,
    dataTypes,
    entityTypeParentIds,
    entityTypes,
    isSpecialEntityTypeLookup,
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
    linkEntityTypeIds: linkInfo.linkEntityTypeIds,
    linkOnlyPropertyBaseUrls: linkInfo.linkOnlyPropertyBaseUrls,
    loading: shouldFetchAvailableTypes
      ? loading || propertyFilterDataLoading
      : propertyFilterDataLoading,
  };
};
