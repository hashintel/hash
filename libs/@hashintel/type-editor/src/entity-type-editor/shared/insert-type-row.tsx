import {
  Box,
  TableCell,
  tableCellClasses,
  TableRow,
  useForkRef,
} from "@mui/material";
import { bindTrigger, PopupState } from "material-ui-popup-state/hooks";
import {
  Dispatch,
  Ref,
  RefObject,
  SetStateAction,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

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

      const table = tableRow.parentNode?.parentNode as HTMLTableElement | null;

      if (!table) {
        return;
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
  const tableRowRef = useRef<HTMLTableRowElement>(null);
  const columnWidth = useTableColumnWidth(tableRowRef);

  return (
    <TableRow
      sx={{
        [`.${tableCellClasses.root}`]: {
          py: 1,
        },
      }}
      ref={tableRowRef}
    >
      <TableCell colSpan={100}>
        <Box sx={{ width: columnWidth ?? 0 }}>
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
                  createButtonProps: createModalPopupState
                    ? {
                        ...withHandler(
                          bindTrigger(createModalPopupState),
                          () => {
                            ourInputRef.current?.focus();
                          },
                        ),
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
            )
          }
        </Box>
      </TableCell>
    </TableRow>
  );
};
