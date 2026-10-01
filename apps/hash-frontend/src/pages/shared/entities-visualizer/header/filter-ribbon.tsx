import { Box } from "@mui/material";
import { useState } from "react";

import {
  FilterGroup,
  Menu,
  SelectableListSearch,
} from "@hashintel/ds-components";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { DsComponentsScope } from "../shared/ds-components-scope";
import {
  archivedFilterOperators,
  getDefaultOperatorForKind,
} from "../shared/property-filters/get-operators-for-kind";
import { PropertyFilterChip } from "./filter-ribbon/property-filter-chip";
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

  /**
   * Adds the filter directly with the kind's default operator pre-selected,
   * ready for a value — the fresh chip receives focus via the group. An
   * incomplete filter contributes no query clause, so adding one refetches
   * nothing; a chip left incomplete is dismissed by the group
   * (`dismissAbandoned`). The input-less boolean default ("is true") is
   * active from the moment it is added.
   */
  const handleAddPropertyFilter = (
    property: Pick<FilterableProperty, "baseUrl" | "title" | "kind">,
  ) => {
    setPropertyFilters((prev) => [
      ...prev,
      {
        id: generatePropertyFilterId(),
        baseUrl: property.baseUrl,
        title: property.title,
        kind: property.kind,
        operator: getDefaultOperatorForKind(property.kind),
      },
    ]);
  };

  /**
   * Adds the archived filter with its default "Included" operator, and widens
   * the query scope to archived entities in the same update — the filter's
   * presence is what carries the inclusion (its "Included" operator builds no
   * clause); its other operators then narrow within that widened scope.
   */
  const handleAddArchivedFilter = () =>
    setFilterState((prev) => ({
      ...prev,
      includeArchived: true,
      propertyFilters: [
        ...prev.propertyFilters,
        {
          id: generatePropertyFilterId(),
          baseUrl: archivedPropertyBaseUrl,
          // The chip reads "Archived"; only the add-menu entry says "Include
          // archived".
          title: "Archived",
          kind: "boolean",
          operator: "included",
        },
      ],
    }));

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
        // Removing the archived filter narrows the scope back to non-archived
        // entities — its presence is what widened it.
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

  const [propertySearch, setPropertySearch] = useState("");
  const searchTerms = propertySearch.toLowerCase().split(/\s+/).filter(Boolean);
  const matchesSearch = (title: string) => {
    const lowercaseTitle = title.toLowerCase();
    return searchTerms.every((term) => lowercaseTitle.includes(term));
  };

  // The archived property is offered as the pinned "Include archived" entry
  // below rather than as an ordinary property. Filterable properties come
  // first, alphabetically; the disabled (non-filterable) ones trail the list.
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

  return (
    /*
     * The ribbon dissolves into the header bar's block flow (`display:
     * contents` here, on the ds scope, and on the filter group's own box) so
     * every pill and chip is an individual inline item in one wrapping
     * context: chips wrap one by one rather than the group moving as a unit,
     * and lines flow around/beneath the bar's floated sort menu. The MUI
     * pills deliberately stay OUTSIDE the `.hash-ds-root` scope element — its
     * preflight would strip their padding and borders.
     */
    <Box
      sx={{
        display: "contents",
        // Block flow has no `gap`, so each control carries the spacing and
        // middle-aligns within its line box. The pills are matched as
        // descendants: web/type nest their chip inside a structural wrapper.
        // (Menus and dropdowns portal away, so nothing portalled is hit.)
        "& .MuiChip-root, & > .MuiIconButton-root, & [data-part='filter-group'] > *":
          {
            verticalAlign: "middle",
            marginRight: 1,
            marginTop: 0.5,
            marginBottom: 0.5,
          },
        // The group's flex-wrap box would wrap as one unit; dissolve it into
        // the surrounding flow. Its display atom carries the @layer
        // polyfill's ID-level specificity boost, which only `!important`
        // outranks.
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
          {visiblePropertyFilters.map((propertyFilter) => (
            <PropertyFilterChip
              key={propertyFilter.id}
              filter={propertyFilter}
              operatorDescriptors={
                propertyFilter.baseUrl === archivedPropertyBaseUrl
                  ? archivedFilterOperators
                  : undefined
              }
              onCommit={(committed) =>
                handleCommitPropertyFilter(propertyFilter.id, committed)
              }
              onRemove={() => handleRemovePropertyFilter(propertyFilter.id)}
            />
          ))}
          <Menu
            trigger={
              <FilterGroup.AddFilter
                renderAs={
                  visiblePropertyFilters.length > 0 ? "plus" : "plusLabel"
                }
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
        </FilterGroup>
      </DsComponentsScope>
    </Box>
  );
};
