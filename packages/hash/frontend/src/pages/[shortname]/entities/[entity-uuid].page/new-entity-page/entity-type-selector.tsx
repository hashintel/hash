import { EntityType } from "@blockprotocol/type-system";
import { FunctionComponent, useContext, useRef, useState } from "react";

import { HashSelectorAutocomplete } from "../../../shared/hash-selector-autocomplete";
import { EntityTypesContext } from "./shared/entity-types-context";

const useEntityTypes = () => {
  return useContext(EntityTypesContext)?.types;
};

// @todo reduce duplication
export const EntityTypeSelector: FunctionComponent<{
  onSelect: (entityType: EntityType) => void;
  onCancel: () => void;
  onCreateNew: (searchValue: string) => void;
}> = ({ onCancel, onSelect, onCreateNew }) => {
  const [search, setSearch] = useState("");
  const entityTypesObject = useEntityTypes();
  const entityTypes = Object.values(entityTypesObject ?? {});

  const [open, setOpen] = useState(false);
  const highlightedRef = useRef<null | EntityType>(null);

  return (
    <HashSelectorAutocomplete
      dropdownProps={{
        query: search,
        createButtonProps: {
          onMouseDown: (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            onCreateNew(search);
          },
        },
        variant: "entityType",
      }}
      options={entityTypes}
      optionToRenderData={({ $id, title, description }) => ({
        $id,
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
        if (option) {
          onSelect(option);
        }
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
      sx={{ maxWidth: 440 }}
    />
  );
};
