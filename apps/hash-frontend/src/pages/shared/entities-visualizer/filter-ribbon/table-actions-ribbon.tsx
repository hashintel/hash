import { Box, Stack, Tooltip } from "@mui/material";

import { IconButton } from "@hashintel/design-system";

import { MagnifyingGlassRegularIcon } from "../../../../shared/icons/magnifying-glass-regular-icon";
import { ExportToCsvButton } from "../../../../shared/table-header/export-to-csv-button";
import { SortControl } from "./sort-control";

import type { BaseUrl } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";
import type { GridSort } from "../../../../components/grid/grid";
import type { GenerateCsvFileFunction } from "../../../../shared/table-header/export-to-csv-button";
import type { SortableEntitiesTableColumnKey } from "../types";

export const TableActionsRibbon: FunctionComponent<{
  sort: GridSort<SortableEntitiesTableColumnKey>;
  setSort: (sort: GridSort<SortableEntitiesTableColumnKey>) => void;
  sortableKeys: SortableEntitiesTableColumnKey[];
  propertyLabels: Record<BaseUrl, string>;
  toggleSearch: () => void;
  generateCsvFile: GenerateCsvFileFunction;
}> = ({
  sort,
  setSort,
  sortableKeys,
  propertyLabels,
  toggleSearch,
  generateCsvFile,
}) => (
  <Stack
    direction="row"
    alignItems="center"
    sx={({ palette }) => ({
      background: palette.common.white,
      borderBottom: `1px solid ${palette.gray[20]}`,
      borderLeft: `1px solid ${palette.gray[30]}`,
      borderRight: `1px solid ${palette.gray[30]}`,
      flexWrap: "wrap",
      gap: 1,
      px: 1.5,
      py: 1,
    })}
  >
    <Tooltip title="Search for text in visible rows" placement="top">
      <IconButton onClick={toggleSearch}>
        <MagnifyingGlassRegularIcon />
      </IconButton>
    </Tooltip>
    <ExportToCsvButton
      generateCsvFile={generateCsvFile}
      sx={{ borderRadius: 1.5 }}
    />
    <Box sx={{ flex: 1 }} />
    <SortControl
      sort={sort}
      setSort={setSort}
      sortableKeys={sortableKeys}
      propertyLabels={propertyLabels}
    />
  </Stack>
);
