import { Box, Tooltip, type SxProps } from "@mui/material";

import { IconButton } from "@hashintel/design-system";

import { MagnifyingGlassRegularIcon } from "../../../../shared/icons/magnifying-glass-regular-icon";
import { ExportToCsvButton } from "../../../../shared/table-header/export-to-csv-button";
import { SortControl } from "./sort-control";

import type { GridSort } from "../../../../components/grid/grid";
import type { GenerateCsvFileFunction } from "../../../../shared/table-header/export-to-csv-button";
import type { SortableEntitiesTableColumnKey } from "../entities-table-data";
import type { FunctionComponent } from "react";

export const toolbarHeight = 44;

const groupSx: SxProps = {
  display: "flex",
  alignItems: "center",
  columnGap: 1,
};

type TableToolbarProps = {
  generateCsvFile: GenerateCsvFileFunction;
  showSearch: boolean;
  setShowSearch: (showSearch: boolean) => void;
  sort: GridSort<SortableEntitiesTableColumnKey>;
  setSort: (sort: GridSort<SortableEntitiesTableColumnKey>) => void;
};

export const TableToolbar: FunctionComponent<TableToolbarProps> = ({
  generateCsvFile,
  showSearch,
  setShowSearch,
  sort,
  setSort,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
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
      <Box sx={groupSx}>
        <Tooltip title="Search for text in visible rows" placement="top">
          <IconButton onClick={() => setShowSearch(!showSearch)}>
            <MagnifyingGlassRegularIcon />
          </IconButton>
        </Tooltip>
        <ExportToCsvButton
          generateCsvFile={generateCsvFile}
          sx={({ palette }) => ({
            borderRadius: "4px",
            px: 1.25,
            border: `1px solid ${palette.gray[30]}`,
          })}
        />
        <SortControl sort={sort} setSort={setSort} />
      </Box>
    </Box>
  );
};
