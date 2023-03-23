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

  const [columnWidth, setColumnWidth] = useState(0);

  useLayoutEffect(() => {
    const calculateColumnWidth = () => {
      const tableRow = tableRowRef.current;
      if (!tableRow) return;

      const table = tableRow.parentNode?.parentNode as HTMLTableElement | null;

      if (!table) return;
      if (table.tagName !== "TABLE") throw new Error("Cannot find table");

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
  }, []);

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
        <Box sx={{ width: columnWidth }}>
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
        </Box>
      </TableCell>
    </TableRow>
  );
};
