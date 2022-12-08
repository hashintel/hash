import { PropertyType } from "@blockprotocol/type-system";
import { PopupState } from "material-ui-popup-state/hooks";
import { forwardRef, ForwardRefRenderFunction, useRef, useState } from "react";
import { usePropertyTypes } from "../../../shared/property-types-context";
import {
  HashSelectorAutocomplete,
  TypeListSelectorDropdownProps,
} from "../../../../../../shared/hash-selector-autocomplete";

const PropertyTypeSelector: ForwardRefRenderFunction<
  HTMLInputElement,
  {
    searchText: string;
    onSearchTextChange: (searchText: string) => void;
    modalPopupState: PopupState;
    onAdd: (option: PropertyType) => void;
    onCancel: () => void;
    filterProperty: (property: PropertyType) => boolean;
    dropdownProps: TypeListSelectorDropdownProps;
  }
> = (
  {
    searchText,
    onSearchTextChange,
    modalPopupState,
    onAdd,
    onCancel,
    filterProperty,
    dropdownProps,
  },
  ref,
) => {
  const propertyTypesObj = usePropertyTypes();
  const propertyTypes = Object.values(propertyTypesObj ?? {});

  const [open, setOpen] = useState(false);
  const highlightedRef = useRef<null | PropertyType>(null);

  return (
    <HashSelectorAutocomplete
      open={open}
      dropdownProps={dropdownProps}
      inputPlaceholder="Search for a property type"
      inputRef={ref}
      optionToRenderData={({ $id, title, description }) => ({
        $id,
        title,
        description,
      })}
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
        if (option) {
          onAdd(option);
        }
      }}
      // Using onKeyUp to prevent a new line character being inputted into inputs in the modal
      onKeyUp={(evt) => {
        if (evt.key === "Enter" && !highlightedRef.current) {
          modalPopupState.open();
        }
      }}
      onKeyDown={(evt) => {
        if (evt.key === "Escape") {
          onCancel();
        }
      }}
      onBlur={() => {
        if (!modalPopupState.isOpen) {
          onCancel();
        }
      }}
      options={
        // @todo make this more efficient
        propertyTypes.filter((type) => filterProperty(type))
      }
    />
  );
};

const PropertyTypeSelectorForwardedRef = forwardRef(PropertyTypeSelector);

export { PropertyTypeSelectorForwardedRef as PropertyTypeSelector };
