import { VersionedUrl } from "@blockprotocol/type-system";
import {
  EntityTypeIcon,
  LinkTypeIcon,
  SelectorAutocomplete,
} from "@hashintel/design-system";
import { EntityTypeWithMetadata } from "@local/hash-subgraph";
import { BoxProps } from "@mui/material";
import { FunctionComponent, useMemo, useRef, useState } from "react";

import { useLatestEntityTypesOptional } from "../../shared/entity-types-context/hooks";
import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";

export const EntityTypeSelector: FunctionComponent<{
  excludeEntityTypeIds?: VersionedUrl[];
  onSelect: (entityType: EntityTypeWithMetadata) => void;
  onCancel: () => void;
  onCreateNew: (searchValue: string) => void;
  disableCreateNewEmpty?: boolean;
  sx?: BoxProps["sx"];
}> = ({
  disableCreateNewEmpty,
  excludeEntityTypeIds,
  onCancel,
  onSelect,
  onCreateNew,
  sx,
}) => {
  const [search, setSearch] = useState("");
  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const entityTypes = useLatestEntityTypesOptional();

  const filteredEntityTypes = useMemo(
    () =>
      entityTypes?.filter(
        ({ schema }) => !excludeEntityTypeIds?.includes(schema.$id),
      ),
    [excludeEntityTypeIds, entityTypes],
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
            onCreateNew(search);
          },
          disabled: disableCreateNewEmpty && search === "",
        },
        variant: "entity type",
      }}
      options={filteredEntityTypes ?? []}
      optionToRenderData={({ schema: { $id, title, description } }) => ({
        uniqueId: $id,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo why this false positive?
        Icon: isSpecialEntityTypeLookup?.[$id]?.isLink
          ? LinkTypeIcon
          : EntityTypeIcon,
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
          onCreateNew(search);
        }
      }}
      onKeyDown={(evt) => {
        if (evt.key === "Escape") {
          onCancel();
        }
      }}
      onBlur={() => {
        onCancel();
      }}
      sx={[{ maxWidth: 440 }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
};
