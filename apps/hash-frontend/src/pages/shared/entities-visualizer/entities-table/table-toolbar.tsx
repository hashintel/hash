import { Box, Tooltip } from "@mui/material";
import { unparse } from "papaparse";
import { useCallback } from "react";

import { IconButton } from "@hashintel/design-system";

import { MagnifyingGlassRegularIcon } from "../../../../shared/icons/magnifying-glass-regular-icon";
import { TableHeaderButton } from "../../../../shared/table-header/table-header-button";
import { generateEntitiesCsvFile } from "./generate-csv-file";
import { SortControl } from "./sort-control";

import type { GridSort } from "../../../../components/grid/grid";
import type {
  EntitiesTableRow,
  SortableEntitiesTableColumnKey,
} from "../types";
import type { BaseUrl } from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { FunctionComponent, MutableRefObject, RefObject } from "react";

export const toolbarHeight = 44;

type TableToolbarProps = {
  csvFileTitle: string;
  currentlyDisplayedColumnsRef: MutableRefObject<SizedGridColumn[] | null>;
  currentlyDisplayedRowsRef: RefObject<EntitiesTableRow[] | null>;
  displayedColumns: SizedGridColumn[];
  showSearch: boolean;
  setShowSearch: (showSearch: boolean) => void;
  sort: GridSort<SortableEntitiesTableColumnKey>;
  setSort: (
    sort: GridSort<SortableEntitiesTableColumnKey> & {
      convertTo?: BaseUrl;
    },
  ) => void;
};

export const TableToolbar: FunctionComponent<TableToolbarProps> = ({
  csvFileTitle,
  currentlyDisplayedColumnsRef,
  currentlyDisplayedRowsRef,
  displayedColumns,
  showSearch,
  setShowSearch,
  sort,
  setSort,
}) => {
  const handleExportToCsv = useCallback(() => {
    const columns = currentlyDisplayedColumnsRef.current;
    const rows = currentlyDisplayedRowsRef.current;

    if (!columns || !rows) {
      return;
    }

    const { title, content } = generateEntitiesCsvFile({
      columns,
      rows,
      title: csvFileTitle,
    });

    const stringifiedContent = unparse(content);

    const blob = new Blob([stringifiedContent], {
      type: "text/csv;charset=utf-8;",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `${title}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [csvFileTitle, currentlyDisplayedColumnsRef, currentlyDisplayedRowsRef]);

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      sx={{
        background: ({ palette }) => palette.common.white,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderStyle: "solid",
        borderColor: ({ palette }) => palette.gray[30],
        px: 1.5,
        py: 0.5,
        gap: 1.5,
        minHeight: toolbarHeight,
      }}
    >
      <Box display="flex" alignItems="center" columnGap={1}>
        <Tooltip title="Search for text in visible rows" placement="top">
          <IconButton onClick={() => setShowSearch(!showSearch)}>
            <MagnifyingGlassRegularIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Export the visible rows to CSV" placement="top">
          <TableHeaderButton
            onClick={handleExportToCsv}
            sx={{ borderRadius: "4px", px: 1.25 }}
          >
            Export
          </TableHeaderButton>
        </Tooltip>
      </Box>
      <Box display="flex" alignItems="center" columnGap={1}>
        <SortControl columns={displayedColumns} sort={sort} setSort={setSort} />
      </Box>
    </Box>
  );
};
