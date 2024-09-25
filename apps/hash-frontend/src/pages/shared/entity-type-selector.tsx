import type { VersionedUrl } from "@blockprotocol/type-system";
import {
  Chip,
  EntityTypeIcon,
  LinkTypeIcon,
  SelectorAutocomplete,
} from "@hashintel/design-system";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { BoxProps } from "@mui/material";
import { useMemo, useRef, useState } from "react";

import { useLatestEntityTypesOptional } from "../../shared/entity-types-context/hooks";
import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";

export const EntityTypeSelector = <Multiple extends boolean = false>({
  disableCreate,
  disableCreateNewEmpty,
  excludeEntityTypeIds,
  excludeLinkTypes,
  inputHeight,
  autoFocus,
  multiple,
  onCancel,
  onSelect,
  onCreateNew,
  sx,
  value,
}: {
  excludeEntityTypeIds?: VersionedUrl[];
  excludeLinkTypes?: boolean;
  inputHeight?: number;
  multiple?: Multiple;
  onSelect: (
    value: Multiple extends true
      ? EntityTypeWithMetadata[]
      : EntityTypeWithMetadata,
  ) => void;
  onCancel?: () => void;
  onCreateNew?: (searchValue: string) => void;
  autoFocus?: boolean;
  disableCreate?: boolean;
  disableCreateNewEmpty?: boolean;
  sx?: BoxProps["sx"];
  value?: Multiple extends true
    ? EntityTypeWithMetadata[]
    : EntityTypeWithMetadata;
}) => {
  const [search, setSearch] = useState("");
  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const { latestEntityTypes } = useLatestEntityTypesOptional();

  const filteredEntityTypes = useMemo(
    () =>
      latestEntityTypes?.filter(
        ({ schema }) =>
          !excludeEntityTypeIds?.includes(schema.$id) &&
          (!excludeLinkTypes ||
            !isSpecialEntityTypeLookup?.[schema.$id]?.isLink),
      ),
    [
      excludeEntityTypeIds,
      excludeLinkTypes,
      isSpecialEntityTypeLookup,
      latestEntityTypes,
    ],
  );

  const [open, setOpen] = useState(false);
  const highlightedRef = useRef<null | EntityTypeWithMetadata>(null);

  return (
    <SelectorAutocomplete<EntityTypeWithMetadata, Multiple>
      dropdownProps={{
        query: search,
        creationProps: {
          createButtonProps: disableCreate
            ? null
            : {
                onMouseDown: (evt) => {
                  evt.preventDefault();
                  evt.stopPropagation();
                  onCreateNew?.(search);
                },
                disabled: disableCreateNewEmpty && search === "",
              },
          variant: "entity type",
        },
      }}
      autoFocus={autoFocus}
      inputHeight={inputHeight}
      options={filteredEntityTypes ?? []}
      multiple={multiple}
      filterOptions={(options, { inputValue }) => {
        return options.filter((option) => {
          const { title, description } = option.schema;
          const lowercaseInput = inputValue.toLowerCase();
          return (
            !!description?.toLowerCase().includes(lowercaseInput) ||
            title.toLowerCase().includes(lowercaseInput)
          );
        });
      }}
      optionToRenderData={({
        schema: { $id, title, description },
        metadata: { icon },
      }) => ({
        uniqueId: $id,
        icon:
          icon ??
          (isSpecialEntityTypeLookup?.[$id]?.isLink ? (
            <LinkTypeIcon />
          ) : (
            <EntityTypeIcon />
          )),
        typeIds: [$id],
        title,
        description,
      })}
      inputPlaceholder={
        !value || (Array.isArray(value) && value.length === 0)
          ? `Search for ${multiple ? "entity types" : "an entity type"}`
          : undefined
      }
      open={open}
      onOpen={() => setOpen(true)}
      onClose={(_, reason) => {
        if (reason !== "toggleInput") {
          setOpen(false);
        }
      }}
      inputValue={search}
      onInputChange={(_, searchValue) => setSearch(searchValue)}
      onHighlightChange={(_, highlightedValue) => {
        highlightedRef.current = highlightedValue;
      }}
      onChange={(_, option) => {
        onSelect(option);
      }}
      onKeyUp={(evt) => {
        if (evt.key === "Enter" && !highlightedRef.current) {
          onCreateNew?.(search);
        }
      }}
      onKeyDown={(evt) => {
        if (evt.key === "Escape") {
          onCancel?.();
        }
      }}
      onClickAway={() => {
        onCancel?.();
      }}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option.schema.$id}
            variant="outlined"
            label={option.schema.title}
          />
        ))
      }
      sx={[{ maxWidth: 440 }, ...(Array.isArray(sx) ? sx : [sx])]}
      value={value}
    />
  );
};
