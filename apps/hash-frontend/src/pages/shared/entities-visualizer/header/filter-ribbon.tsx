import { Box } from "@mui/material";
import { useState } from "react";

import { getDefaultOperatorForKind } from "../shared/property-filters/get-operators-for-kind";
import { AddFiltersMenu } from "./add-filters-menu";
import { IncludeArchivedPill } from "./include-archived-pill";
import { PropertyFilterPill } from "./property-filter-pill";
import { TypeFilterPill } from "./type-filter-pill";
import { WebFilterPill } from "./web-filter-pill";

import type { EntitiesFilterState } from "../shared/filter-state";
import type {
  FilterableProperty,
  FilterValueKind,
  PropertyFilter,
} from "../shared/property-filters/property-filter";
import type { AvailableType } from "../shared/use-available-types";
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
  const [draftPropertyFilter, setDraftPropertyFilter] =
    useState<PropertyFilter | null>(null);

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
    setDraftPropertyFilter({
      id: generatePropertyFilterId(),
      baseUrl: property.baseUrl,
      title: property.title,
      kind: property.kind,
      operator: getDefaultOperatorForKind(property.kind),
    });
  };

  const handleCommitDraftPropertyFilter = (committed: PropertyFilter) => {
    setPropertyFilters((prev) => [...prev, committed]);
    setDraftPropertyFilter(null);
  };

  const handleCommitPropertyFilter = (id: string, committed: PropertyFilter) =>
    setPropertyFilters((prev) =>
      prev.map((propertyFilter) =>
        propertyFilter.id === id ? committed : propertyFilter,
      ),
    );

  const handleRemovePropertyFilter = (id: string) =>
    setPropertyFilters((prev) =>
      prev.filter((propertyFilter) => propertyFilter.id !== id),
    );

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
          mode="edit"
          autoOpen={false}
          onAutoOpenHandled={() => {}}
          onCommit={(committed) =>
            handleCommitPropertyFilter(propertyFilter.id, committed)
          }
          onRemove={() => handleRemovePropertyFilter(propertyFilter.id)}
        />
      ))}
      {draftPropertyFilter && (
        <PropertyFilterPill
          key={draftPropertyFilter.id}
          filter={draftPropertyFilter}
          mode="add"
          autoOpen
          onAutoOpenHandled={() => {}}
          onCommit={handleCommitDraftPropertyFilter}
          onRemove={() => setDraftPropertyFilter(null)}
        />
      )}
      <AddFiltersMenu
        canAddIncludeArchived={!filterState.includeArchived}
        onAddIncludeArchived={() => setIncludeArchived(true)}
        filterableProperties={filterableProperties}
        propertiesLoading={propertiesLoading}
        onAddPropertyFilter={handleAddPropertyFilter}
      />
    </Box>
  );
};
