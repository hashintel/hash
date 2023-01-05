import {
  TableCell,
  tableCellClasses,
  TableRow,
  useForkRef,
} from "@mui/material";
import { bindTrigger, PopupState } from "material-ui-popup-state/hooks";
import { Dispatch, Ref, SetStateAction, useRef } from "react";

import {
  TypeSelector,
  TypeSelectorType,
} from "./insert-property-row/type-selector";
import { withHandler } from "./with-handler";

export type InsertTypeRowProps<T extends TypeSelectorType> = {
  inputRef: Ref<HTMLInputElement | null>;
  onCancel: () => void;
  onAdd: (option: T) => void;
  variant: "property" | "link";
  createModalPopupState?: PopupState;
  searchText: string;
  onSearchTextChange: Dispatch<SetStateAction<string>>;
  options: T[];
};

export const InsertTypeRow = <T extends TypeSelectorType>({
  inputRef,
  onCancel,
  onAdd,
  variant,
  createModalPopupState,
  searchText,
  onSearchTextChange,
  options,
}: InsertTypeRowProps<T>) => {
  const ourInputRef = useRef<HTMLInputElement>(null);
  const sharedRef = useForkRef(inputRef, ourInputRef);

  return (
    <TableRow
      sx={{
        [`.${tableCellClasses.root}`]: {
          py: 1,
        },
      }}
    >
      <TableCell colSpan={2}>
        <TypeSelector
          searchText={searchText}
          onSearchTextChange={onSearchTextChange}
          inputRef={sharedRef}
          createModalPopupState={createModalPopupState}
          onAdd={onAdd}
          onCancel={onCancel}
          options={options}
          dropdownProps={{
            query: searchText,
            createButtonProps: createModalPopupState
              ? {
                  ...withHandler(bindTrigger(createModalPopupState), () => {
                    ourInputRef.current?.focus();
                  }),
                  onMouseDown: (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                  },
                }
              : null,
            variant: variant === "property" ? "propertyType" : "linkType",
          }}
          variant={variant}
        />
      </TableCell>
    </TableRow>
  );
};
