import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { TypeListSelectorDropdownProps } from "@hashintel/design-system";
import { SelectorAutocomplete } from "@hashintel/design-system";
import type { SvgIconProps, SxProps, Theme } from "@mui/material";
import type { PopupState } from "material-ui-popup-state/hooks";
import type { FunctionComponent, Ref } from "react";
import { useRef, useState } from "react";

export type TypeSelectorType = {
  $id: VersionedUrl;
  Icon: FunctionComponent<SvgIconProps> | null;
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
      data-testid="type-selector"
      noOptionsText="No results"
      dropdownProps={dropdownProps}
      inputPlaceholder={`Search for ${
        variant === "entity type" ? "an" : "a"
      } ${variant}`}
      inputRef={inputRef}
      isOptionEqualToValue={(option, value) => option.$id === value.$id}
      optionToRenderData={({ $id, Icon, title, description }) => ({
        typeId: $id,
        icon: Icon ? <Icon /> : null,
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
      onClickAway={() => {
        if (!createModalPopupState?.isOpen) {
          onCancel();
        }
      }}
      options={options}
      sx={sx}
    />
  );
};
