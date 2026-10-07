import { Box } from "@mui/material";
import { useMemo } from "react";

import { Filter, FilterGroup, Menu } from "@hashintel/ds-components";

import { useLatestEntityTypesOptional } from "../../../shared/entity-types-context/hooks";
import { usePropertyTypes } from "../../../shared/property-types-context";
import { useDataTypesContext } from "../data-types-context";
import { DsComponentsScope } from "../ds-components-scope";
import { filterChipPillChrome } from "../filter-bar";
import { TypeFilterChip } from "./filter-ribbon/type-filter-chip";
import {
  getDefaultTypeFilterOperator,
  lastEditedWithinOptions,
  typeFilterFieldLabels,
  typeFilterOperatorsByField,
  typeKindFilterOptions,
  typeSourceFilterOptions,
} from "./shared/type-filters";

import type { MinimalActor } from "../../../shared/use-actors";
import type { TypeFilter, TypeFilterField } from "./shared/type-filters";
import type {
  ItemOrGroup,
  MenuItem,
  MultiSelectItem,
} from "@hashintel/ds-components";
import type { SxProps, Theme } from "@mui/material";
import type { FunctionComponent } from "react";

let typeFilterIdCounter = 0;
const generateTypeFilterId = () => {
  typeFilterIdCounter += 1;
  return `type-filter-${typeFilterIdCounter}`;
};

const compareByText = (left: { text: string }, right: { text: string }) =>
  left.text.localeCompare(right.text);

const searchableFields: TypeFilterField[] = [
  "lastEditedBy",
  "inheritsFrom",
  "hasProperty",
];

const chipWrapperSx: SxProps<Theme> = {
  display: "inline-flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 1,
};

export const TypesFilterRibbon: FunctionComponent<{
  filters: TypeFilter[];
  setFilters: (updater: (prev: TypeFilter[]) => TypeFilter[]) => void;
  /** The actors who last edited the displayed types, for the editor picker. */
  editors?: MinimalActor[];
  /** The kind filter is redundant on single-kind tabs. */
  showKindFilter: boolean;
}> = ({ filters, setFilters, editors, showKindFilter }) => {
  const { latestEntityTypes } = useLatestEntityTypesOptional();
  const { latestDataTypes } = useDataTypesContext();
  const { propertyTypes } = usePropertyTypes({ latestOnly: true });

  const inheritsFromItems = useMemo<Array<ItemOrGroup<MultiSelectItem>>>(() => {
    const entityTypeItems = (latestEntityTypes ?? [])
      .map((entityType) => ({
        value: entityType.metadata.recordId.baseUrl,
        text: entityType.schema.title,
      }))
      .sort(compareByText);
    const dataTypeItems = Object.values(latestDataTypes ?? {})
      .map((dataType) => ({
        value: dataType.metadata.recordId.baseUrl,
        text: dataType.schema.title,
      }))
      .sort(compareByText);
    return [
      { id: "entity-types", label: "Entity types", items: entityTypeItems },
      { id: "data-types", label: "Data types", items: dataTypeItems },
    ];
  }, [latestEntityTypes, latestDataTypes]);

  const propertyItems = useMemo<MultiSelectItem[]>(
    () =>
      Object.values(propertyTypes ?? {})
        .map((propertyType) => ({
          value: propertyType.metadata.recordId.baseUrl,
          text: propertyType.schema.title,
        }))
        .sort(compareByText),
    [propertyTypes],
  );

  const editorItems = useMemo<MultiSelectItem[]>(
    () =>
      (editors ?? [])
        .map((editor) => ({
          value: editor.accountId,
          text: editor.displayName ?? "Unknown",
        }))
        .sort(compareByText),
    [editors],
  );

  const selectItemsForField = (
    field: TypeFilterField,
  ): ReadonlyArray<ItemOrGroup<MultiSelectItem>> => {
    switch (field) {
      case "archived":
        return [];
      case "kind":
        return typeKindFilterOptions;
      case "source":
        return typeSourceFilterOptions;
      case "lastEdited":
        return lastEditedWithinOptions;
      case "lastEditedBy":
        return editorItems;
      case "inheritsFrom":
        return inheritsFromItems;
      case "hasProperty":
        return propertyItems;
    }
  };

  const handleAddFilter = (field: TypeFilterField) =>
    setFilters((prev) => [
      ...prev,
      {
        id: generateTypeFilterId(),
        field,
        operator: getDefaultTypeFilterOperator(field),
      },
    ]);

  const handleSwitchFilterField = (id: string, field: TypeFilterField) =>
    setFilters((prev) =>
      prev.map((filter) =>
        filter.id === id
          ? { id, field, operator: getDefaultTypeFilterOperator(field) }
          : filter,
      ),
    );

  const handleCommitFilter = (id: string, committed: TypeFilter) =>
    setFilters((prev) =>
      prev.map((filter) => (filter.id === id ? committed : filter)),
    );

  const handleRemoveFilter = (id: string) =>
    setFilters((prev) => prev.filter((filter) => filter.id !== id));

  const handleClearFilters = () => setFilters(() => []);

  const archivedFilterActive = filters.some(
    (filter) => filter.field === "archived",
  );

  const switchableFields = (
    Object.keys(typeFilterOperatorsByField) as Array<
      Exclude<TypeFilterField, "archived">
    >
  ).filter((field) => field !== "kind" || showKindFilter);

  const addFilterMenuItems: MenuItem[] = [
    ...(archivedFilterActive
      ? []
      : [
          {
            id: "archived",
            text: typeFilterFieldLabels.archived,
            onClick: () => handleAddFilter("archived"),
          } satisfies MenuItem,
        ]),
    ...switchableFields.map(
      (field): MenuItem => ({
        id: field,
        text: typeFilterFieldLabels[field],
        onClick: () => handleAddFilter(field),
      }),
    ),
  ];

  const fieldMenuForFilter = (filter: TypeFilter): MenuItem[] =>
    switchableFields.map((field) => ({
      id: field,
      text: typeFilterFieldLabels[field],
      selected: field === filter.field,
      selectedStyle: "tick" as const,
      onClick: () => {
        if (field !== filter.field) {
          handleSwitchFilterField(filter.id, field);
        }
      },
    }));

  const renderFilterChip = (filter: TypeFilter) =>
    filter.field === "archived" ? (
      <Filter
        key={filter.id}
        className={filterChipPillChrome}
        property={filter.id}
        propertyLabel={typeFilterFieldLabels.archived}
        operators={[]}
        onChange={() => {}}
        removeable={{ onRemove: () => handleRemoveFilter(filter.id) }}
      />
    ) : (
      <TypeFilterChip
        key={filter.id}
        className={filterChipPillChrome}
        filter={filter}
        fieldMenu={fieldMenuForFilter(filter)}
        selectItems={selectItemsForField(filter.field)}
        searchable={searchableFields.includes(filter.field)}
        onCommit={(committed) => handleCommitFilter(filter.id, committed)}
        onRemove={() => handleRemoveFilter(filter.id)}
      />
    );

  const trailingControls = (
    <>
      <Menu
        trigger={
          <FilterGroup.AddFilter
            renderAs={filters.length > 0 ? "plus" : "plusLabel"}
          />
        }
        items={addFilterMenuItems}
      />
      {filters.length > 1 && (
        <FilterGroup.ClearFilters
          aria-label="Clear filters"
          onClick={handleClearFilters}
        />
      )}
    </>
  );

  return (
    <Box
      sx={{
        display: "contents",
        "& [data-part='filter-group'] > *": {
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
      <DsComponentsScope sx={{ display: "contents" }}>
        <FilterGroup dismissAbandoned>
          {filters.map((filter, index) => (
            <Box key={filter.id} sx={chipWrapperSx}>
              {renderFilterChip(filter)}
              {index === filters.length - 1 && trailingControls}
            </Box>
          ))}
          {filters.length === 0 && (
            <Box sx={chipWrapperSx}>{trailingControls}</Box>
          )}
        </FilterGroup>
      </DsComponentsScope>
    </Box>
  );
};
