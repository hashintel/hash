import "@glideapps/glide-data-grid/dist/index.css";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import {
  GridCellKind,
  GridColumn,
  SizedGridColumn,
} from "@glideapps/glide-data-grid";
import {
  Chip,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system";
import { Box, Paper, Stack } from "@mui/material";
import { useMemo, useState } from "react";
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
import { useEntityTypeEntities } from "../../../../../components/hooks/useEntityTypeEntities";
import { useEntityType } from "../use-entity-type";
import { useRemotePropertyTypes } from "../use-property-types";
import { NextPageWithLayout } from "../../../../../shared/layout";

// interface LinkColumn extends SizedGridColumn {
//   id: ColumnKey;
// }

// export const columns: LinkColumn[] = [
//   {
//     title: "Entity",
//     id: "entity",
//     width: 200,
//   },
//   {
//     title: "Namespace",
//     id: "namespace",
//     width: 200,
//   },
//   {
//     title: "Slug",
//     id: "slug",
//     width: 200,
//   },
//   {
//     title: "Additional Types",
//     id: "additionalTypes",
//     width: 200,
//   },
// ];

const entityTypeId = "http://localhost:3000/@example/types/entity-type/user/";

interface User {
  name: string;
  surname: String;
}

// type ColumnKey = keyof User;

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

const Page: NextPageWithLayout = () => {
  const [showSearch, setShowSearch] = useState(false);

  const [tableSort, setTableSort] = useState<TableSort<string>>({
    key: "name",
    dir: "desc",
  });

  const propertyTypes = useRemotePropertyTypes();

  const [remoteEntityType] = useEntityType(entityTypeId);

  const entities = useEntityTypeEntities(entityTypeId);

  const [gridIds, columns] = useMemo(() => {
    console.log(remoteEntityType);
    const gridIds = ["entity", "namespace", "slug", "additionalTypes"];

    const columns: GridColumn[] = [
      {
        title: "Entity",
        id: "entity",
        width: 200,
      },
      {
        title: "Namespace",
        id: "namespace",
        width: 200,
      },
      {
        title: "Slug",
        id: "slug",
        width: 200,
      },
      {
        title: "Additional Types",
        id: "additionalTypes",
        width: 200,
      },
      ...(remoteEntityType
        ? Object.entries(remoteEntityType.properties).map((property) => {
            console.log(property);
            console.log(propertyTypes);
            const propertyType = propertyTypes[property];
            console.log(propertyType);
            return {
              title: propertyType.title,
              id: propertyType.$id,
              width: 200,
            };
          })
        : []),
    ];

    return [gridIds, columns];
  }, [remoteEntityType, propertyTypes]);

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
        title="Entities"
        titleTooltip="This table lists all entities with the ‘Company’ type that are accessible to you"
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
              // const user = sortedUsers[row];

              // const objKey = gridIndexes[col];
              // const cellValue = user[objKey];

              // return {
              //   kind: GridCellKind.Text,
              //   allowOverlay: true,
              //   copyData: cellValue,
              //   displayData: cellValue,
              //   data: cellValue,
              // };
              return {
                kind: GridCellKind.Text,
                allowOverlay: true,
                copyData: "test",
                displayData: "test",
                data: "test",
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
