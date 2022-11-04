import "@glideapps/glide-data-grid/dist/index.css";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { GridCellKind, SizedGridColumn } from "@glideapps/glide-data-grid";
import {
  Chip,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system";
import { Box, Paper, Stack } from "@mui/material";
import { useState } from "react";
import { GlideGrid } from "../../../../../components/GlideGlid/glide-grid";
import { GlideGridOverlayPortal } from "../../../../../components/GlideGlid/glide-grid-overlay-portal";
import {
  createHandleHeaderClicked,
  sortRowData,
  TableSort,
} from "../../../../../components/GlideGlid/utils/sorting";
import { useDrawHeader } from "../../../../../components/GlideGlid/utils/use-draw-header";
import { renderDataTypeCell } from "../../../../[account-slug]/entities/[entity-id].page/entity-editor/properties-section/property-table/cells/data-type-cell";
import { EntitySection } from "../../../../[account-slug]/entities/[entity-id].page/entity-editor/shared/entity-section";
import { WhiteChip } from "../../../../[account-slug]/entities/[entity-id].page/entity-editor/shared/white-chip";

interface LinkColumn extends SizedGridColumn {
  id: ColumnKey;
}

export const columns: LinkColumn[] = [
  {
    title: "Name",
    id: "name",
    width: 200,
  },
  {
    title: "Surname",
    id: "surname",
    width: 200,
    grow: 1,
  },
];

interface User {
  name: string;
  surname: String;
}

type ColumnKey = keyof User;

const users: User[] = [
  {
    name: "yusuf",
    surname: "kınataş",
  },
  {
    name: "luis",
    surname: "bettencourt",
  },
  {
    name: "bob",
    surname: "bettencourt",
  },
  {
    name: "zoe",
    surname: "bettencourt",
  },
];

const gridIndexes = ["name", "surname"];

const Page = () => {
  const [showSearch, setShowSearch] = useState(false);

  const [tableSort, setTableSort] = useState<TableSort<ColumnKey>>({
    key: "name",
    dir: "desc",
  });

  const drawHeader = useDrawHeader(tableSort, columns);

  const handleHeaderClicked = createHandleHeaderClicked(
    columns,
    tableSort,
    setTableSort,
  );

  const sortedUsers = sortRowData(users, tableSort);

  return (
    <Box m={5}>
      <EntitySection
        title="Properties"
        titleTooltip="The properties on an entity are determined by its type. To add a new property to this entity, specify an additional type or edit an existing one."
        titleStartContent={
          <Stack direction="row" spacing={1.5}>
            <Chip size="xs" label="3 values" />
            <WhiteChip size="xs" label="$3 empty" />
            <Stack direction="row" spacing={0.5}>
              <IconButton
                rounded
                onClick={() => setShowSearch(true)}
                sx={{ color: ({ palette }) => palette.gray[60] }}
              >
                <FontAwesomeIcon icon={faMagnifyingGlass} />
              </IconButton>
            </Stack>
          </Stack>
        }
      >
        <Paper sx={{ overflow: "hidden" }}>
          <GlideGrid
            showSearch={showSearch}
            onSearchClose={() => setShowSearch(false)}
            onHeaderClicked={handleHeaderClicked}
            drawHeader={drawHeader}
            columns={columns}
            rows={users.length}
            getCellContent={([col, row]) => {
              const user = sortedUsers[row];

              const objKey = gridIndexes[col];
              const cellValue = user[objKey];

              return {
                kind: GridCellKind.Text,
                allowOverlay: true,
                copyData: cellValue,
                displayData: cellValue,
                data: cellValue,
              };
            }}
            customRenderers={[renderDataTypeCell]}
          />
        </Paper>
      </EntitySection>
      <GlideGridOverlayPortal />
    </Box>
  );
};

export default Page;
