import { Box } from "@mui/material";
import { useState } from "react";

import { getDefaultOperatorForKind } from "../data/property-filters/get-operators-for-kind";
import { createDefaultFilterState } from "../data/types";
import { AddFiltersMenu } from "./add-filters-menu";
import { ClearFiltersButton } from "./clear-filters-button";
import { IncludeArchivedPill } from "./include-archived-pill";
import { PropertyFilterPill } from "./property-filter-pill";
import { TypeFilterPill } from "./type-filter-pill";
import { WebFilterPill } from "./web-filter-pill";

import type {
  FilterableProperty,
  FilterValueKind,
  PropertyFilter,
} from "../data/property-filters/types";
import type { EntitiesFilterState } from "../data/types";
import type { AvailableType } from "../data/use-available-types";
import type { BaseUrl, WebId } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";

type FilterRibbonProps = {
  availableTypes: AvailableType[];
  availableTypesLoading: boolean;
  filterableProperties: FilterableProperty[];
  propertiesLoading: boolean;
  filterState: EntitiesFilterState;
  internalWebIds: WebId[];
  isTypePinned: boolean;
  setFilterState: (
    updater: (prev: EntitiesFilterState) => EntitiesFilterState,
  ) => void;
};

const isWebFilterDefault = (
  web: EntitiesFilterState["web"],
  internalWebIds: WebId[],
) => {
  if (web.includeOtherWebs) {
    return false;
  }

  return internalWebIds.every((id) => web.selectedInternalWebIds.has(id));
};

const isTypeFilterDefault = (
  type: EntitiesFilterState["type"],
  availableTypes: AvailableType[],
) => {
  if (type.selectedTypeIds === null) {
    return true;
  }

  return availableTypes.every(({ entityTypeId }) =>
    type.selectedTypeIds!.has(entityTypeId),
  );
};

let propertyFilterIdCounter = 0;
const generatePropertyFilterId = () => {
  propertyFilterIdCounter += 1;
  return `property-filter-${propertyFilterIdCounter}`;
};

export const FilterRibbon: FunctionComponent<FilterRibbonProps> = ({
  availableTypes,
  availableTypesLoading,
  filterableProperties,
  propertiesLoading,
  filterState,
  internalWebIds,
  isTypePinned,
  setFilterState,
}) => {
  /**
   * Ephemeral UI state (not part of the persisted filter state): the id of a
   * just-added property filter whose editor should open automatically.
   */
  const [autoOpenPropertyFilterId, setAutoOpenPropertyFilterId] = useState<
    string | null
  >(null);

  const setIncludeArchived = (includeArchived: boolean) =>
    setFilterState((prev) => ({ ...prev, includeArchived }));

  const setPropertyFilters = (
    updater: (prev: PropertyFilter[]) => PropertyFilter[],
  ) =>
    setFilterState((prev) => ({
      ...prev,
      propertyFilters: updater(prev.propertyFilters),
    }));

  const handleAddPropertyFilter = (property: {
    baseUrl: BaseUrl;
    title: string;
    kind: FilterValueKind;
  }) => {
    const id = generatePropertyFilterId();

    setPropertyFilters((prev) => [
      ...prev,
      {
        id,
        baseUrl: property.baseUrl,
        title: property.title,
        kind: property.kind,
        operator: getDefaultOperatorForKind(property.kind),
      },
    ]);

    setAutoOpenPropertyFilterId(id);
  };

  const handleChangePropertyFilter = (
    id: string,
    updater: (prev: PropertyFilter) => PropertyFilter,
  ) =>
    setPropertyFilters((prev) =>
      prev.map((propertyFilter) =>
        propertyFilter.id === id ? updater(propertyFilter) : propertyFilter,
      ),
    );

  const handleRemovePropertyFilter = (id: string) =>
    setPropertyFilters((prev) =>
      prev.filter((propertyFilter) => propertyFilter.id !== id),
    );

  const webIsDefault = isWebFilterDefault(filterState.web, internalWebIds);
  const typeIsDefault =
    isTypePinned || isTypeFilterDefault(filterState.type, availableTypes);
  const archivedIsDefault = !filterState.includeArchived;
  const propertyFiltersAreDefault = filterState.propertyFilters.length === 0;

  const filtersAreDefault =
    webIsDefault &&
    typeIsDefault &&
    archivedIsDefault &&
    propertyFiltersAreDefault;

  const handleClear = () => {
    setFilterState(() => createDefaultFilterState(internalWebIds));
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
      }}
    >
      <WebFilterPill
        internalWebIds={internalWebIds}
        webState={filterState.web}
        setWebState={(updater) =>
          setFilterState((prev) => ({ ...prev, web: updater(prev.web) }))
        }
      />
      {!isTypePinned && (
        <TypeFilterPill
          availableTypes={availableTypes}
          loading={availableTypesLoading}
          typeState={filterState.type}
          setTypeState={(updater) =>
            setFilterState((prev) => ({ ...prev, type: updater(prev.type) }))
          }
        />
      )}
      {filterState.includeArchived && (
        <IncludeArchivedPill onRemove={() => setIncludeArchived(false)} />
      )}
      {filterState.propertyFilters.map((propertyFilter) => (
        <PropertyFilterPill
          key={propertyFilter.id}
          filter={propertyFilter}
          autoOpen={autoOpenPropertyFilterId === propertyFilter.id}
          onAutoOpenHandled={() => setAutoOpenPropertyFilterId(null)}
          onChange={(updater) =>
            handleChangePropertyFilter(propertyFilter.id, updater)
          }
          onRemove={() => handleRemovePropertyFilter(propertyFilter.id)}
        />
      ))}
      <AddFiltersMenu
        canAddIncludeArchived={!filterState.includeArchived}
        onAddIncludeArchived={() => setIncludeArchived(true)}
        filterableProperties={filterableProperties}
        propertiesLoading={propertiesLoading}
        onAddPropertyFilter={handleAddPropertyFilter}
      />
      {!filtersAreDefault && <ClearFiltersButton onClear={handleClear} />}
    </Box>
  );
};
