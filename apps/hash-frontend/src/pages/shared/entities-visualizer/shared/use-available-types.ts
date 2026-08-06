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
import type { EntityTableSummary } from "@local/hash-graph-sdk/entity";

export type AvailableType = {
  entityTypeId: VersionedUrl;
  title: string;
  count: number;
};

/**
 * Where the type summary the available types derive from comes from: fetched
 * by the hook itself, or provided by the caller — the table endpoint's first
 * page carries one.
 */
export type SummarySource =
  | { mode: "fetch" }
  | {
      mode: "external";
      /** The provided summary, or `null` while the caller still loads it. */
      summary: EntityTableSummary | null;
      /**
       * Set when the caller's summary failed to load, so a `null`
       * {@link summary} reads as an error instead of loading forever.
       */
      error?: Error;
    };

export const useAvailableTypes = ({
  filterState,
  internalWebs,
  entityTypeBaseUrl,
  entityTypeIds,
  summarySource,
}: {
  filterState: EntitiesFilterState;
  internalWebs: { webId: WebId }[];
  entityTypeBaseUrl?: BaseUrl;
  entityTypeIds?: VersionedUrl[];
  summarySource: SummarySource;
}): {
  availableEntityTypes: AvailableType[];
  /**
   * The pinned types, with a base-URL pin resolved to all its versions.
   * `null` when no type is pinned, or while a base-URL pin still awaits the
   * loaded entity types.
   */
  pinnedEntityTypeIds: VersionedUrl[] | null;
  propertyFilterData: FilterMetadataForProperty[];
  loading: boolean;
  /**
   * The type universe: the entity type ids present in the current result set,
   * or `null` while the summary has not arrived yet (or is not fetched at all,
   * for pinned types). Feeds the include-type clause of the main entities
   * query — see `buildEntitiesFilter`.
   */
  typeUniverse: VersionedUrl[] | null;
  /**
   * Set when no type universe can be provided — the summary query failed with
   * no cached universe to fall back on, or its response was missing the
   * requested type ids. The main entities query stays gated in that case, so
   * callers should surface this instead of an endless loading state.
   */
  typeUniverseError?: Error;
  refetchTypeUniverse: () => Promise<unknown>;
} => {
  const { entityTypes, entityTypeParentIds } = useEntityTypesContextRequired();
  const { dataTypes } = useDataTypesContext();
  const { propertyTypes } = usePropertyTypes();

  const isTypePinned = !!entityTypeBaseUrl || !!entityTypeIds?.length;
  const shouldFetchAvailableTypes =
    !isTypePinned && summarySource.mode === "fetch";

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

  // No typeUniverse here — this query defines the universe. Feeding it back in
  // would ratchet it shut against newly appearing types.
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

  const { data, error, loading, refetch } = useQuery<
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

  /**
   * The summary the available types derive from, wherever it came from.
   * `null` while none has arrived.
   */
  const summaryTypeData = useMemo<{
    typeIds: Record<VersionedUrl, number>;
    typeTitles: Record<VersionedUrl, string>;
  } | null>(() => {
    if (summarySource.mode === "external") {
      return summarySource.summary
        ? {
            typeIds: summarySource.summary.entityTypeIds,
            typeTitles: summarySource.summary.entityTypeTitles,
          }
        : null;
    }

    return data
      ? {
          typeIds: data.summarizeEntities.typeIds ?? {},
          typeTitles: data.summarizeEntities.typeTitles ?? {},
        }
      : null;
  }, [summarySource, data]);

  const { availableEntityTypes, propertyFilterData } = useMemo<{
    availableEntityTypes: AvailableType[];
    propertyFilterData: FilterMetadataForProperty[];
  }>(() => {
    if (!isTypePinned && !summaryTypeData) {
      return { availableEntityTypes: [], propertyFilterData: [] };
    }

    const typeIds = summaryTypeData?.typeIds ?? {};
    const typeTitles = summaryTypeData?.typeTitles ?? {};

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

    const availableEntityTypeIds = !isTypePinned
      ? (Object.keys(typeIds) as VersionedUrl[])
      : (pinnedEntityTypeIds ?? []);
    const selectedAvailableEntityTypeIds = !isTypePinned
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
    summaryTypeData,
    dataTypes,
    entityTypeParentIds,
    entityTypes,
    isTypePinned,
    pinnedEntityTypeIds,
    filterState.type.selectedTypeIds,
    propertyTypes,
  ]);

  const propertyFilterDataLoading =
    !dataTypes || !entityTypes || !entityTypeParentIds || !propertyTypes;

  // A present-but-empty typeIds map means "genuinely zero matching entities" and
  // yields a match-nothing clause. An ABSENT map despite includeTypeIds being
  // requested is a broken response — coercing it to an empty universe would
  // silently render the whole workspace as "0 entities", so it surfaces as an
  // error instead.
  const typeUniverse = useMemo<VersionedUrl[] | null>(() => {
    if (summarySource.mode === "external") {
      return summarySource.summary
        ? (Object.keys(summarySource.summary.entityTypeIds) as VersionedUrl[])
        : null;
    }

    if (!data?.summarizeEntities.typeIds) {
      return null;
    }

    return Object.keys(data.summarizeEntities.typeIds) as VersionedUrl[];
  }, [summarySource, data]);

  // Only fatal when it leaves us without a universe — a failed background
  // refresh with a cached universe still renders (slightly stale) results,
  // which beats flipping a working page into an error state. An external
  // summary reports its failures through its own path.
  const typeUniverseError = useMemo<Error | undefined>(() => {
    if (summarySource.mode === "external") {
      return typeUniverse === null ? summarySource.error : undefined;
    }
    if (typeUniverse !== null) {
      return undefined;
    }

    if (error) {
      return error;
    }

    if (data && !data.summarizeEntities.typeIds) {
      return new Error(
        "summarizeEntities returned no typeIds although they were requested",
      );
    }

    return undefined;
  }, [summarySource, data, error, typeUniverse]);

  return {
    availableEntityTypes,
    pinnedEntityTypeIds,
    propertyFilterData,
    loading:
      summarySource.mode === "external"
        ? (summarySource.summary === null && !summarySource.error) ||
          propertyFilterDataLoading
        : shouldFetchAvailableTypes
          ? loading || propertyFilterDataLoading
          : propertyFilterDataLoading,
    typeUniverse,
    typeUniverseError,
    refetchTypeUniverse: refetch,
  };
};
