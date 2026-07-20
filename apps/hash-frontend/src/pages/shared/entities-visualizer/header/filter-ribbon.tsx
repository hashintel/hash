import { Box } from "@mui/material";
import { useState } from "react";

import { getDefaultOperatorForKind } from "../shared/property-filters/get-operators-for-kind";
import { AddFiltersMenu } from "./add-filters-menu";
import { IncludeArchivedPill } from "./include-archived-pill";
import { PropertyFilterPill } from "./property-filter-pill";
import { TypeFilterPill } from "./type-filter-pill";
import { type InternalWeb, WebFilterPill } from "./web-filter-pill";

import type { EntitiesFilterState } from "../shared/filter-state";
import type {
  FilterableProperty,
  FilterMetadataForProperty,
  PropertyFilter,
} from "../shared/property-filters/property-filter";
import type { TypeColorOverrides } from "../shared/type-colors";
import type { AvailableType } from "../shared/use-available-types";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";

type FilterRibbonProps = {
  availableEntityTypes: AvailableType[];
  availableTypesLoading: boolean;
  propertyFilterMetadata: FilterMetadataForProperty[];
  filterState: EntitiesFilterState;
  internalWebs: InternalWeb[];
  isTypePinned: boolean;
  setFilterState: (
    updater: (prev: EntitiesFilterState) => EntitiesFilterState,
  ) => void;
  /** Show a per-type colour selector in the type filter (network graph view). */
  showTypeColors: boolean;
  typeColorOverrides: TypeColorOverrides;
  setTypeColor: (entityTypeId: VersionedUrl, color: string) => void;
};

let propertyFilterIdCounter = 0;
const generatePropertyFilterId = () => {
  propertyFilterIdCounter += 1;
  return `property-filter-${propertyFilterIdCounter}`;
};

export const FilterRibbon: FunctionComponent<FilterRibbonProps> = ({
  availableEntityTypes,
  availableTypesLoading,
  propertyFilterMetadata,
  filterState,
  internalWebs,
  isTypePinned,
  setFilterState,
  showTypeColors,
  typeColorOverrides,
  setTypeColor,
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

  const handleAddPropertyFilter = (
    property: Pick<FilterableProperty, "baseUrl" | "title" | "kind">,
  ) => {
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
        internalWebs={internalWebs}
        webState={filterState.web}
        setWebState={(updater) =>
          setFilterState((prev) => ({ ...prev, web: updater(prev.web) }))
        }
      />
      {!isTypePinned && (
        <TypeFilterPill
          availableTypes={availableEntityTypes}
          loading={availableTypesLoading}
          typeState={filterState.type}
          setTypeState={(updater) =>
            setFilterState((prev) => ({ ...prev, type: updater(prev.type) }))
          }
          showColors={showTypeColors}
          typeColorOverrides={typeColorOverrides}
          setTypeColor={setTypeColor}
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
          onCommit={handleCommitDraftPropertyFilter}
          onRemove={() => setDraftPropertyFilter(null)}
        />
      )}
      <AddFiltersMenu
        canAddIncludeArchived={!filterState.includeArchived}
        onAddIncludeArchived={() => setIncludeArchived(true)}
        filterableProperties={propertyFilterMetadata}
        propertiesLoading={availableTypesLoading}
        onAddPropertyFilter={handleAddPropertyFilter}
      />
    </Box>
  );
};
