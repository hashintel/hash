import { useEffect } from "react";

import type { EntitiesFilterState } from "./shared/filter-state";
import type { FilterMetadataForProperty } from "./shared/property-filters/property-filter";
import type { AvailableType } from "./shared/use-available-types";
import type { Dispatch, SetStateAction } from "react";

interface UsePruneStaleFilters {
  readonly availableEntityTypes: AvailableType[];
  readonly availableTypesLoading: boolean;
  readonly filterState: EntitiesFilterState;
  readonly isTypePinned: boolean;
  readonly propertyFilterData: FilterMetadataForProperty[];
  readonly setFilterState: Dispatch<SetStateAction<EntitiesFilterState>>;
}

/**
 * Drops filter selections that no longer apply once the available types for
 * the current result set are known: selected type ids that are no longer
 * present, and property filters whose property is no longer filterable (e.g.
 * after deselecting the type that provided it).
 *
 * This is deliberately an effect rather than a render-time derivation: the
 * pruned state must be written back to the canonical filter state (and
 * therefore the URL), not just displayed differently.
 */
export const usePruneStaleFilters = ({
  availableEntityTypes,
  availableTypesLoading,
  filterState: {
    propertyFilters,
    type: { selectedTypeIds },
  },
  isTypePinned,
  propertyFilterData,
  setFilterState,
}: UsePruneStaleFilters): void => {
  useEffect(() => {
    if (availableTypesLoading) {
      return;
    }

    let nextSelectedTypeIds = selectedTypeIds;

    if (!isTypePinned && selectedTypeIds) {
      const availableEntityTypeIds = new Set(
        availableEntityTypes.map(
          ({ entityTypeId: availableEntityTypeId }) => availableEntityTypeId,
        ),
      );

      const retainedSelectedTypeIds = [...selectedTypeIds].filter(
        (selectedTypeId) => availableEntityTypeIds.has(selectedTypeId),
      );

      if (retainedSelectedTypeIds.length !== selectedTypeIds.size) {
        nextSelectedTypeIds =
          retainedSelectedTypeIds.length === 0
            ? null
            : new Set(retainedSelectedTypeIds);
      }
    }

    let nextPropertyFilters = propertyFilters;
    if (propertyFilters.length) {
      const filterablePropertyKindsByBaseUrl = new Map(
        propertyFilterData
          .filter((property) => property.filterable)
          .map((property) => [property.baseUrl, property.kind]),
      );

      nextPropertyFilters = propertyFilters.filter(
        ({ baseUrl, kind }) =>
          filterablePropertyKindsByBaseUrl.get(baseUrl) === kind,
      );
    }

    const typeFilterChanged = nextSelectedTypeIds !== selectedTypeIds;
    const propertyFiltersChanged =
      nextPropertyFilters.length !== propertyFilters.length;

    if (!typeFilterChanged && !propertyFiltersChanged) {
      return;
    }

    setFilterState((prev) => ({
      ...prev,
      type: typeFilterChanged
        ? { selectedTypeIds: nextSelectedTypeIds }
        : prev.type,
      propertyFilters: propertyFiltersChanged
        ? nextPropertyFilters
        : prev.propertyFilters,
    }));
  }, [
    availableEntityTypes,
    availableTypesLoading,
    propertyFilters,
    selectedTypeIds,
    isTypePinned,
    propertyFilterData,
    setFilterState,
  ]);
};
