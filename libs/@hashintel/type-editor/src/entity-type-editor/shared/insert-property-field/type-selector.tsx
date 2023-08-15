import {
  SelectorAutocomplete,
  TypeListSelectorDropdownProps,
} from "@hashintel/design-system";
import { SxProps, Theme } from "@mui/material";
import { PopupState } from "material-ui-popup-state/hooks";
import { Ref, useRef, useState } from "react";

export type TypeSelectorType = {
  $id: string;
  title: string;
  description?: string;
};

export const TypeSelector = <T extends TypeSelectorType>({
  searchText,
  onSearchTextChange,
  createModalPopupState,
  onAdd,
  onCancel,
  dropdownProps,
  options,
  inputRef,
  sx,
  variant,
}: {
  searchText: string;
  onSearchTextChange: (searchText: string) => void;
  createModalPopupState?: PopupState;
  onAdd: (option: T) => void;
  onCancel: () => void;
  dropdownProps: TypeListSelectorDropdownProps;
  options: T[];
  inputRef: Ref<HTMLInputElement>;
  sx?: SxProps<Theme>;
  variant: "entity type" | "property type" | "link type";
}) => {
  const [open, setOpen] = useState(false);
  const highlightedRef = useRef<null | T>(null);

  return (
    <SelectorAutocomplete
      dropdownProps={dropdownProps}
      inputPlaceholder={`Search for ${
        variant === "entity type" ? "an" : "a"
      } ${variant}`}
      inputRef={inputRef}
      isOptionEqualToValue={(option, value) => option.$id === value.$id}
      optionToRenderData={({ $id, title, description }) => ({
        typeId: $id,
        uniqueId: $id,
        title,
        description,
      })}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={(_, reason) => {
        if (reason !== "toggleInput") {
          setOpen(false);
        }
      }}
      inputValue={searchText}
      onInputChange={(_, value) => onSearchTextChange(value)}
      onHighlightChange={(_, value) => {
        highlightedRef.current = value;
      }}
      onChange={(_, option) => {
        onAdd(option);
      }}
      // Using onKeyUp to prevent a new line character being inputted into inputs in the modal
      onKeyUp={(evt) => {
        if (evt.key === "Enter" && !highlightedRef.current) {
          createModalPopupState?.open();
        }
      }}
      onKeyDown={(evt) => {
        if (evt.key === "Escape") {
          onCancel();
        }
      }}
      onBlur={() => {
        if (!createModalPopupState?.isOpen) {
          onCancel();
        }
      }}
      options={options}
      sx={sx}
    />
  );
};
