import { Box } from "@mui/material";
import { useCallback, useMemo } from "react";

import { WandMagicSparklesIcon } from "@hashintel/design-system";
import { Filter } from "@hashintel/ds-components";

import { useLatestEntityTypesOptional } from "../../../shared/entity-types-context/hooks";
import { HashSolidIcon } from "../../../shared/icons/hash-solid-icon";
import { UserIcon } from "../../../shared/icons/user-icon";
import { usePropertyTypes } from "../../../shared/property-types-context";
import { isAiMachineActor } from "../../../shared/use-actors";
import { useDataTypesContext } from "../data-types-context";
import { filterChipPillChrome, FilterGroupRibbon } from "../filter-bar";
import { TypeFilterChip } from "./filter-ribbon/type-filter-chip";
import {
  getDefaultTypeFilterOperator,
  lastEditedWithinOptions,
  typeFilterFieldLabels,
  typeFilterOperatorsByField,
  typeKindFilterOptions,
} from "./shared/type-filters";

import type { MinimalActor } from "../../../shared/use-actors";
import type { TypeFilter, TypeFilterField } from "./shared/type-filters";
import type {
  ItemOrGroup,
  MenuItem,
  MultiSelectItem,
} from "@hashintel/ds-components";
import type { FunctionComponent, ReactNode } from "react";

let typeFilterIdCounter = 0;
const generateTypeFilterId = () => {
  typeFilterIdCounter += 1;
  return `type-filter-${typeFilterIdCounter}`;
};

const compareByText = (left: { text: string }, right: { text: string }) =>
  left.text.localeCompare(right.text);

const compareFieldsByLabel = (left: TypeFilterField, right: TypeFilterField) =>
  typeFilterFieldLabels[left].localeCompare(typeFilterFieldLabels[right]);

const searchableFields: TypeFilterField[] = [
  "lastEditedBy",
  "inheritsFrom",
  "hasProperty",
];

export const TypesFilterRibbon: FunctionComponent<{
  filters: TypeFilter[];
  setFilters: (updater: (prev: TypeFilter[]) => TypeFilter[]) => void;
  /** The actors who last edited the displayed types, for the editor picker. */
  editors?: MinimalActor[];
  /** The kind filter is redundant on single-kind tabs. */
  showKindFilter: boolean;
  /** Pills leading the chip group (search toggle, web pill). */
  leadingControls?: ReactNode;
}> = ({ filters, setFilters, editors, showKindFilter, leadingControls }) => {
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

  /** The same icon logic as the table's "Last Edited By" pill. */
  const renderEditorItem = useCallback(
    (value: string): ReactNode => {
      const editor = editors?.find(
        (candidate) => candidate.accountId === value,
      );
      if (!editor) {
        return value;
      }
      return (
        <Box
          component="span"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.6,
            "& svg": {
              fontSize: 14,
              color: ({ palette }) => palette.gray[60],
            },
          }}
        >
          {editor.kind === "machine" ? (
            isAiMachineActor(editor) ? (
              <WandMagicSparklesIcon />
            ) : (
              <HashSolidIcon />
            )
          ) : (
            <UserIcon />
          )}
          {editor.displayName ?? "Unknown"}
        </Box>
      );
    },
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
  )
    .filter((field) => field !== "kind" || showKindFilter)
    .sort(compareFieldsByLabel);

  const addFilterMenuItems: MenuItem[] = [
    ...(archivedFilterActive ? [] : (["archived"] as const)),
    ...switchableFields,
  ]
    .sort(compareFieldsByLabel)
    .map(
      (field): MenuItem => ({
        id: field,
        text: typeFilterFieldLabels[field],
        onClick: () => handleAddFilter(field),
      }),
    );

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
        renderSelectItem={
          filter.field === "lastEditedBy" ? renderEditorItem : undefined
        }
        onCommit={(committed) => handleCommitFilter(filter.id, committed)}
        onRemove={() => handleRemoveFilter(filter.id)}
      />
    );

  return (
    <FilterGroupRibbon
      leadingControls={leadingControls}
      chips={filters.map((filter) => ({
        id: filter.id,
        chip: renderFilterChip(filter),
      }))}
      addFilterMenuItems={addFilterMenuItems}
      onClearFilters={handleClearFilters}
    />
  );
};
