import { Box, useForkRef } from "@mui/material";
import type { PopupState } from "material-ui-popup-state/hooks";
import { bindTrigger } from "material-ui-popup-state/hooks";
import type { Dispatch, Ref, RefObject, SetStateAction } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import type { TypeSelectorType } from "./insert-property-field/type-selector";
import { TypeSelector } from "./insert-property-field/type-selector";
import { withHandler } from "./with-handler";

export type InsertTypeFieldProps<T extends TypeSelectorType> = {
  inputRef: Ref<HTMLInputElement | null>;
  onCancel: () => void;
  onAdd: (option: T) => void;
  variant: "entity type" | "property type" | "link type";
  createModalPopupState?: PopupState;
  searchText: string;
  onSearchTextChange: Dispatch<SetStateAction<string>>;
  options: T[];
};

/**
 * Our table row has to be full width to ensure its background covers the entire
 * width of the table when sticky. However, the selector should be the width
 * of the first two columns. This emulates that.
 */
const useTableColumnWidth = (tableRowRef: RefObject<HTMLTableRowElement>) => {
  const [columnWidth, setColumnWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const calculateColumnWidth = () => {
      const tableRow = tableRowRef.current;
      if (!tableRow) {
        return;
      }

      let table: HTMLElement = tableRow;

      while (
        table !== document.documentElement &&
        table.parentNode &&
        table.tagName !== "TABLE"
      ) {
        table = table.parentNode as HTMLElement;
      }

      if (table.tagName !== "TABLE") {
        throw new Error("Cannot find table");
      }

      const firstHeader = table.querySelector("th:nth-of-type(1)");
      const secondHeader = table.querySelector("th:nth-of-type(2)");

      const nextColumnWidth =
        (firstHeader?.getBoundingClientRect().width ?? 0) +
        (secondHeader?.getBoundingClientRect().width ?? 0);

      setColumnWidth(nextColumnWidth);
    };

    calculateColumnWidth();

    window.addEventListener("resize", calculateColumnWidth);

    return () => {
      window.removeEventListener("resize", calculateColumnWidth);
    };
  }, [tableRowRef]);

  return columnWidth;
};

export const InsertTypeField = <T extends TypeSelectorType>({
  inputRef,
  onCancel,
  onAdd,
  variant,
  createModalPopupState,
  searchText,
  onSearchTextChange,
  options,
}: InsertTypeFieldProps<T>) => {
  const ourInputRef = useRef<HTMLInputElement>(null);
  const sharedRef = useForkRef(inputRef, ourInputRef);
  const tableRowRef = useRef<HTMLTableRowElement>(null);
  const columnWidth = useTableColumnWidth(tableRowRef);

  return (
    <Box
      sx={{
        py: 1,
        pl: "var(--table-cell-left-padding)",
        width: `${columnWidth ?? 0}px !important`,
      }}
      ref={tableRowRef}
    >
      {
        // Deferring rendering of the type selector until column width is
        // available, so the menu renders at the correct width
        columnWidth === null ? null : (
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
              creationProps: {
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
                variant,
              },
            }}
            variant={variant}
          />
        )
      }
    </Box>
  );
};
