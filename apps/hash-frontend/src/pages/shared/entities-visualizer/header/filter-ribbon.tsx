import { Box } from "@mui/material";
import { useState } from "react";

import {
  Filter,
  FilterGroup,
  Menu,
  SelectableListSearch,
} from "@hashintel/ds-components";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { DsComponentsScope } from "../shared/ds-components-scope";
import { getDefaultOperatorForKind } from "../shared/property-filters/get-operators-for-kind";
import { filterChipPillChrome } from "./filter-ribbon/filter-chip-pill-chrome";
import {
  PropertyFilterChip,
  type SwitchablePropertyOption,
} from "./filter-ribbon/property-filter-chip";
import { TypeFilterPill } from "./type-filter-pill";
import { type InternalWeb, WebFilterPill } from "./web-filter-pill";

import type { EntitiesFilterState } from "../shared/filter-state";
import type {
  FilterableProperty,
  FilterMetadataForProperty,
  PropertyFilter,
  PropertyFilterDisabledReason,
} from "../shared/property-filters/property-filter";
import type { TypeColorOverrides } from "../shared/type-colors";
import type { AvailableType } from "../shared/use-available-types";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { ItemOrGroup, MenuItem } from "@hashintel/ds-components";
import type { SxProps, Theme } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

type FilterRibbonProps = {
  availableEntityTypes: AvailableType[];
  availableTypesLoading: boolean;
  propertyFilterMetadata: FilterMetadataForProperty[];
  filterState: EntitiesFilterState;
  internalWebs: InternalWeb[];
  isTypePinned: boolean;
  /** The search toggle, leading the ribbon's controls (absent in Grid view). */
  searchControl?: ReactNode;
  setFilterState: (
    updater: (prev: EntitiesFilterState) => EntitiesFilterState,
  ) => void;
  /** Show a per-type colour selector in the type filter (network graph view). */
  showTypeColors: boolean;
  typeColorOverrides: TypeColorOverrides;
  setTypeColor: (entityTypeId: VersionedUrl, color: string) => void;
  /**
   * Type ids to hide from the type filter, and property base URLs to hide from
   * the property picker and its active pills (the graph view's link types and
   * link-only properties). Hiding is display-only: the underlying filter state is
   * untouched, so filters set in the table view survive a switch to the graph.
   */
  hiddenTypeIds: ReadonlySet<VersionedUrl>;
  hiddenPropertyBaseUrls: ReadonlySet<BaseUrl>;
};

let propertyFilterIdCounter = 0;
const generatePropertyFilterId = () => {
  propertyFilterIdCounter += 1;
  return `property-filter-${propertyFilterIdCounter}`;
};

const disabledReasonText: Record<PropertyFilterDisabledReason, string> = {
  "multiple-data-types":
    "Properties with multiple possible data types can’t be filtered yet.",
  list: "List properties can’t be filtered yet.",
  nested: "Nested properties can’t be filtered yet.",
};

const archivedPropertyBaseUrl =
  systemPropertyTypes.archived.propertyTypeBaseUrl;

const chipWrapperSx: SxProps<Theme> = {
  display: "inline-flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 1,
};

export const FilterRibbon: FunctionComponent<FilterRibbonProps> = ({
  availableEntityTypes,
  availableTypesLoading,
  propertyFilterMetadata,
  filterState,
  internalWebs,
  isTypePinned,
  searchControl,
  setFilterState,
  showTypeColors,
  typeColorOverrides,
  setTypeColor,
  hiddenTypeIds,
  hiddenPropertyBaseUrls,
}) => {
  // Properties offered in the picker, and the active property chips, with the
  // hidden (link-only) ones removed — display only; `filterState` keeps them.
  const visiblePropertyFilterMetadata = propertyFilterMetadata.filter(
    (property) => !hiddenPropertyBaseUrls.has(property.baseUrl),
  );
  const visiblePropertyFilters = filterState.propertyFilters.filter(
    (propertyFilter) => !hiddenPropertyBaseUrls.has(propertyFilter.baseUrl),
  );

  const setPropertyFilters = (
    updater: (prev: PropertyFilter[]) => PropertyFilter[],
  ) =>
    setFilterState((prev) => ({
      ...prev,
      propertyFilters: updater(prev.propertyFilters),
    }));

  const handleAddPropertyFilter = (
    property: Pick<
      FilterableProperty,
      "baseUrl" | "title" | "kind" | "enumOptions"
    >,
  ) => {
    setPropertyFilters((prev) => [
      ...prev,
      {
        id: generatePropertyFilterId(),
        baseUrl: property.baseUrl,
        title: property.title,
        kind: property.kind,
        operator: getDefaultOperatorForKind(property.kind),
        ...(property.enumOptions ? { enumOptions: property.enumOptions } : {}),
      },
    ]);
  };

  const handleAddArchivedFilter = () =>
    setFilterState((prev) => ({
      ...prev,
      includeArchived: true,
      propertyFilters: [
        ...prev.propertyFilters,
        {
          id: generatePropertyFilterId(),
          baseUrl: archivedPropertyBaseUrl,
          title: "Include archived",
          kind: "boolean",
          operator: "included",
        },
      ],
    }));

  const handleSwitchPropertyFilter = (
    id: string,
    property: SwitchablePropertyOption,
  ) =>
    setPropertyFilters((prev) =>
      prev.map((propertyFilter) => {
        if (propertyFilter.id !== id) {
          return propertyFilter;
        }
        const keepsValue =
          propertyFilter.kind === property.kind && property.kind !== "enum";
        return {
          id: propertyFilter.id,
          baseUrl: property.baseUrl,
          title: property.title,
          kind: property.kind,
          operator: keepsValue
            ? propertyFilter.operator
            : getDefaultOperatorForKind(property.kind),
          ...(keepsValue
            ? {
                value: propertyFilter.value,
                secondValue: propertyFilter.secondValue,
                values: propertyFilter.values,
              }
            : {}),
          ...(property.enumOptions
            ? { enumOptions: property.enumOptions }
            : {}),
        };
      }),
    );

  const handleCommitPropertyFilter = (id: string, committed: PropertyFilter) =>
    setPropertyFilters((prev) =>
      prev.map((propertyFilter) =>
        propertyFilter.id === id ? committed : propertyFilter,
      ),
    );

  const handleRemovePropertyFilter = (id: string) =>
    setFilterState((prev) => {
      const removed = prev.propertyFilters.find(
        (propertyFilter) => propertyFilter.id === id,
      );
      return {
        ...prev,
        includeArchived:
          removed?.baseUrl === archivedPropertyBaseUrl
            ? false
            : prev.includeArchived,
        propertyFilters: prev.propertyFilters.filter(
          (propertyFilter) => propertyFilter.id !== id,
        ),
      };
    });

  const archivedFilterActive = filterState.propertyFilters.some(
    (propertyFilter) => propertyFilter.baseUrl === archivedPropertyBaseUrl,
  );

  const handleClearPropertyFilters = () =>
    setFilterState((prev) => ({
      ...prev,
      includeArchived: false,
      propertyFilters: prev.propertyFilters.filter((propertyFilter) =>
        hiddenPropertyBaseUrls.has(propertyFilter.baseUrl),
      ),
    }));

  const switchablePropertyOptions: SwitchablePropertyOption[] =
    visiblePropertyFilterMetadata
      .filter((property) => property.baseUrl !== archivedPropertyBaseUrl)
      .flatMap((property) => (property.filterable ? [property] : []))
      .sort((left, right) => left.title.localeCompare(right.title));

  const [propertySearch, setPropertySearch] = useState("");
  const searchTerms = propertySearch.toLowerCase().split(/\s+/).filter(Boolean);
  const matchesSearch = (title: string) => {
    const lowercaseTitle = title.toLowerCase();
    return searchTerms.every((term) => lowercaseTitle.includes(term));
  };

  const propertyItems: MenuItem[] = visiblePropertyFilterMetadata
    .filter(
      (property) =>
        property.baseUrl !== archivedPropertyBaseUrl &&
        matchesSearch(property.title),
    )
    .sort((left, right) =>
      left.filterable === right.filterable
        ? left.title.localeCompare(right.title)
        : left.filterable
          ? -1
          : 1,
    )
    .map(
      (property): MenuItem =>
        property.filterable
          ? {
              id: property.baseUrl,
              text: property.title,
              onClick: () => handleAddPropertyFilter(property),
            }
          : {
              id: property.baseUrl,
              text: property.title,
              disabled: true,
              description: disabledReasonText[property.disabledReason],
              onClick: () => {},
            },
    );

  if (propertyItems.length === 0) {
    propertyItems.push({
      id: "no-filterable-properties",
      text:
        searchTerms.length > 0
          ? "No matching properties"
          : availableTypesLoading
            ? "Loading properties…"
            : "No filterable properties",
      disabled: true,
      onClick: () => {},
    });
  }

  const addFilterMenuItems: Array<ItemOrGroup<MenuItem>> = [
    ...(archivedFilterActive || !matchesSearch("Include archived")
      ? []
      : [
          {
            id: "include-archived",
            text: "Include archived",
            onClick: handleAddArchivedFilter,
          } satisfies MenuItem,
        ]),
    { id: "properties", label: "Properties", items: propertyItems },
  ];

  const renderPropertyFilterChip = (propertyFilter: PropertyFilter) =>
    propertyFilter.baseUrl === archivedPropertyBaseUrl ? (
      <Filter
        key={propertyFilter.id}
        className={filterChipPillChrome}
        property={propertyFilter.id}
        propertyLabel="Include archived"
        operators={[]}
        onChange={() => {}}
        removeable={{
          onRemove: () => handleRemovePropertyFilter(propertyFilter.id),
        }}
      />
    ) : (
      <PropertyFilterChip
        key={propertyFilter.id}
        className={filterChipPillChrome}
        filter={propertyFilter}
        propertyOptions={switchablePropertyOptions}
        onSwitchProperty={(property) =>
          handleSwitchPropertyFilter(propertyFilter.id, property)
        }
        onCommit={(committed) =>
          handleCommitPropertyFilter(propertyFilter.id, committed)
        }
        onRemove={() => handleRemovePropertyFilter(propertyFilter.id)}
      />
    );

  const trailingControls = (
    <>
      <Menu
        trigger={
          <FilterGroup.AddFilter
            renderAs={visiblePropertyFilters.length > 0 ? "plus" : "plusLabel"}
          />
        }
        items={addFilterMenuItems}
        header={
          <SelectableListSearch
            value={propertySearch}
            onChange={setPropertySearch}
            placeholder="Search properties"
            aria-label="Search properties"
          />
        }
        swapHeaderFooterOnFlip
        onOpen={(open) => {
          if (!open) {
            setPropertySearch("");
          }
        }}
      />
      {visiblePropertyFilters.length > 1 && (
        <FilterGroup.ClearFilters
          aria-label="Clear filters"
          onClick={handleClearPropertyFilters}
        />
      )}
    </>
  );

  return (
    <Box
      sx={{
        display: "contents",
        "& .MuiChip-root, & > .MuiIconButton-root, & [data-part='filter-group'] > *":
          {
            verticalAlign: "middle",
            marginRight: 1,
            marginTop: 0.5,
            marginBottom: 0.5,
          },
        "& [data-part='filter-group']": {
          display: "contents !important",
        },
      }}
    >
      {searchControl}
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
          hiddenTypeIds={hiddenTypeIds}
        />
      )}
      <DsComponentsScope sx={{ display: "contents" }}>
        <FilterGroup dismissAbandoned>
          {visiblePropertyFilters.map((propertyFilter, index) => (
            <Box key={propertyFilter.id} sx={chipWrapperSx}>
              {renderPropertyFilterChip(propertyFilter)}
              {index === visiblePropertyFilters.length - 1 && trailingControls}
            </Box>
          ))}
          {visiblePropertyFilters.length === 0 && (
            <Box sx={chipWrapperSx}>{trailingControls}</Box>
          )}
        </FilterGroup>
      </DsComponentsScope>
    </Box>
  );
};
