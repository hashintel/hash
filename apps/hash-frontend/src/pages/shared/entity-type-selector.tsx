import type { VersionedUrl } from "@blockprotocol/type-system";
import {
  EntityTypeIcon,
  LinkTypeIcon,
  SelectorAutocomplete,
} from "@hashintel/design-system";
import type { EntityTypeWithMetadata } from "@local/hash-subgraph";
import type { BoxProps } from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo, useRef, useState } from "react";

import { useLatestEntityTypesOptional } from "../../shared/entity-types-context/hooks";
import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";

export const EntityTypeSelector: FunctionComponent<{
  excludeEntityTypeIds?: VersionedUrl[];
  onSelect: (entityType: EntityTypeWithMetadata) => void;
  onCancel?: () => void;
  onCreateNew?: (searchValue: string) => void;
  autoFocus?: boolean;
  disableCreateNewEmpty?: boolean;
  sx?: BoxProps["sx"];
}> = ({
  disableCreateNewEmpty,
  excludeEntityTypeIds,
  autoFocus,
  onCancel,
  onSelect,
  onCreateNew,
  sx,
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
    <SelectorAutocomplete
      dropdownProps={{
        query: search,
        createButtonProps: {
          onMouseDown: (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            onCreateNew?.(search);
          },
          disabled: disableCreateNewEmpty && search === "",
        },
        variant: "entity type",
      }}
      autoFocus={autoFocus}
      options={filteredEntityTypes ?? []}
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
      inputPlaceholder="Search for an entity type"
      open={open}
      onOpen={() => setOpen(true)}
      onClose={(_, reason) => {
        if (reason !== "toggleInput") {
          setOpen(false);
        }
      }}
      inputValue={search}
      onInputChange={(_, value) => setSearch(value)}
      onHighlightChange={(_, value) => {
        highlightedRef.current = value;
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
      sx={[{ maxWidth: 440 }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
};
