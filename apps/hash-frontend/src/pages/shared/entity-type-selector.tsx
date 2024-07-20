import { useMemo, useRef, useState } from "react";
import type { VersionedUrl } from "@blockprotocol/type-system";
import {
  Chip,
  EntityTypeIcon,
  LinkTypeIcon,
  SelectorAutocomplete,
} from "@hashintel/design-system";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { BoxProps } from "@mui/material";

import { useLatestEntityTypesOptional } from "../../shared/entity-types-context/hooks";
import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";

export const EntityTypeSelector = <Multiple extends boolean = false>({
  disableCreate,
  disableCreateNewEmpty,
  excludeEntityTypeIds,
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
        ({ schema }) => !excludeEntityTypeIds?.includes(schema.$id),
      ),
    [excludeEntityTypeIds, latestEntityTypes],
  );

  const [open, setOpen] = useState(false);
  const highlightedRef = useRef<null | EntityTypeWithMetadata>(null);

  return (
    <SelectorAutocomplete<EntityTypeWithMetadata, Multiple>
      autoFocus={autoFocus}
      inputHeight={inputHeight}
      options={filteredEntityTypes ?? []}
      multiple={multiple}
      open={open}
      inputValue={search}
      sx={[{ maxWidth: 440 }, ...(Array.isArray(sx) ? sx : [sx])]}
      value={value}
      dropdownProps={{
        query: search,
        creationProps: {
          createButtonProps: disableCreate
            ? null
            : {
                onMouseDown: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onCreateNew?.(search);
                },
                disabled: disableCreateNewEmpty && search === "",
              },
          variant: "entity type",
        },
      }}
      filterOptions={(options, { inputValue }) => {
        return options.filter((option) => {
          const { title, description } = option.schema;
          const lowercaseInput = inputValue.toLowerCase();

          return (
            Boolean(description?.toLowerCase().includes(lowercaseInput)) ||
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
        typeId: $id,
        title,
        description,
      })}
      inputPlaceholder={
        !value || (Array.isArray(value) && value.length === 0)
          ? `Search for ${multiple ? "entity types" : "an entity type"}`
          : undefined
      }
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option.schema.$id}
            variant={"outlined"}
            label={option.schema.title}
          />
        ))
      }
      onOpen={() => { setOpen(true); }}
      onInputChange={(_, searchValue) => { setSearch(searchValue); }}
      onClose={(_, reason) => {
        if (reason !== "toggleInput") {
          setOpen(false);
        }
      }}
      onHighlightChange={(_, highlightedValue) => {
        highlightedRef.current = highlightedValue;
      }}
      onChange={(_, option) => {
        onSelect(option);
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" && !highlightedRef.current) {
          onCreateNew?.(search);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onCancel?.();
        }
      }}
      onClickAway={() => {
        onCancel?.();
      }}
    />
  );
};
