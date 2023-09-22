import { VersionedUrl } from "@blockprotocol/type-system";
import {
  GridCellKind,
  Item,
  SizedGridColumn,
  TextCell,
} from "@glideapps/glide-data-grid";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  isExternalOntologyElementMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { Box, useTheme } from "@mui/material";
import { useRouter } from "next/router";
import {
  FunctionComponent,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  Grid,
  gridHeaderHeightWithBorder,
  gridHorizontalScrollbarHeight,
  gridRowHeight,
} from "../../../components/grid/grid";
import { useOrgs } from "../../../components/hooks/use-orgs";
import { useUsers } from "../../../components/hooks/use-users";
import { extractOwnedById } from "../../../lib/user-and-org";
import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { isTypeArchived } from "../../../shared/is-archived";
import { HEADER_HEIGHT } from "../../../shared/layout/layout-with-header/page-header";
import {
  FilterState,
  TableHeader,
  tableHeaderHeight,
} from "../../../shared/table-header";
import {
  createRenderTextIconCell,
  TextIconCell,
} from "../../shared/entities-table/text-icon-cell";
import { TOP_CONTEXT_BAR_HEIGHT } from "../../shared/top-context-bar";
import { WorkspaceContext } from "../../shared/workspace-context";

const typesTableColumnIds = [
  "title",
  "kind",
  "namespaceShortname",
  "archived",
] as const;

type LinkColumnId = (typeof typesTableColumnIds)[number];

type TypesTableColumn = {
  id: LinkColumnId;
} & SizedGridColumn;

type TypesTableRow = {
  rowId: string;
  kind: "entity-type" | "property-type" | "link-type" | "data-type";
  typeId: VersionedUrl;
  title: string;
  external: boolean;
  namespaceShortname?: string;
  archived: boolean;
};

export const TypesTable: FunctionComponent<{
  types: (
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  kind: "all" | "entity-type" | "property-type" | "link-type" | "data-type";
}> = ({ types, kind }) => {
  const router = useRouter();

  const [showSearch, setShowSearch] = useState<boolean>(false);

  const [selectedRows, setSelectedRows] = useState<TypesTableRow[]>([]);

  const { activeWorkspaceOwnedById } = useContext(WorkspaceContext);

  const [filterState, setFilterState] = useState<FilterState>({
    includeArchived: false,
    includeGlobal: false,
  });

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const typesTableColumns = useMemo<TypesTableColumn[]>(
    () => [
      {
        id: "title",
        title: "Title",
        width: 252,
        grow: 2,
      },
      ...(kind === "all"
        ? [
            {
              id: "kind",
              title: "Type",
              width: 200,
            } as const,
          ]
        : []),
      {
        id: "namespaceShortname",
        title: "Namespace",
        width: 200,
      },
      {
        id: "archived",
        title: "Archived",
        width: 200,
      },
    ],
    [kind],
  );

  const { users } = useUsers();
  const { orgs } = useOrgs();

  const namespaces = useMemo(
    () => (users && orgs ? [...users, ...orgs] : undefined),
    [users, orgs],
  );

  const filteredRows = useMemo<TypesTableRow[]>(
    () =>
      types
        .map((type) => {
          const isExternal = isExternalOntologyElementMetadata(type.metadata)
            ? true
            : type.metadata.custom.ownedById !== activeWorkspaceOwnedById;

          const namespaceOwnedById = isExternalOntologyElementMetadata(
            type.metadata,
          )
            ? undefined
            : type.metadata.custom.ownedById;

          const namespace = namespaces?.find(
            (workspace) => extractOwnedById(workspace) === namespaceOwnedById,
          );

          return {
            rowId: type.schema.$id,
            typeId: type.schema.$id,
            title: type.schema.title,
            kind:
              type.schema.kind === "entityType"
                ? isSpecialEntityTypeLookup?.[type.schema.$id]?.isFile
                  ? "link-type"
                  : "entity-type"
                : type.schema.kind === "propertyType"
                ? "property-type"
                : "data-type",
            external: isExternal,
            namespaceShortname: namespace?.shortname,
            archived: isTypeArchived(type),
          } as const;
        })
        .filter(
          ({ external, archived }) =>
            (filterState.includeGlobal ? true : !external) &&
            (filterState.includeArchived ? true : !archived),
        ),
    [
      isSpecialEntityTypeLookup,
      types,
      namespaces,
      filterState,
      activeWorkspaceOwnedById,
    ],
  );

  const createGetCellContent = useCallback(
    (rows: TypesTableRow[]) =>
      ([colIndex, rowIndex]: Item): TextCell | TextIconCell => {
        const row = rows[rowIndex];

        if (!row) {
          throw new Error("link not found");
        }

        const column = typesTableColumns[colIndex];

        if (!column) {
          throw new Error("column not found");
        }

        switch (column.id) {
          case "title":
            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: false,
              copyData: row.title,
              cursor: "pointer",
              data: {
                kind: "text-icon-cell",
                icon: "bpAsterisk",
                value: row.title,
                onClick: () => router.push(row.typeId),
              },
            };
          case "kind":
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(row.kind),
              data: row.kind,
            };
          case "namespaceShortname": {
            const value = row.namespaceShortname
              ? `@${row.namespaceShortname}`
              : "";

            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(value),
              data: value,
            };
          }
          case "archived": {
            const value = row.archived ? "Yes" : "No";
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(value),
              data: value,
            };
          }
        }
      },
    [typesTableColumns, router],
  );

  const theme = useTheme();

  return (
    <Box>
      <TableHeader
        items={types}
        filterState={filterState}
        setFilterState={setFilterState}
        selectedItems={types.filter((type) =>
          selectedRows.some(({ typeId }) => type.schema.$id === typeId),
        )}
        onBulkActionCompleted={() => setSelectedRows([])}
      />
      <Grid
        showSearch={showSearch}
        onSearchClose={() => setShowSearch(false)}
        columns={typesTableColumns}
        rows={filteredRows}
        enableCheckboxSelection
        selectedRows={selectedRows}
        onSelectedRowsChange={(updatedSelectedRows) =>
          setSelectedRows(updatedSelectedRows)
        }
        sortable
        firstColumnLeftPadding={16}
        createGetCellContent={createGetCellContent}
        // define max height if there are lots of rows
        height={`
          min(
            calc(100vh - (${
              HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 170 + tableHeaderHeight
            }px + ${theme.spacing(5)}) - ${theme.spacing(5)}),
            calc(
              ${gridHeaderHeightWithBorder}px +
              (${filteredRows.length} * ${gridRowHeight}px) +
              ${gridHorizontalScrollbarHeight}px
            )
          )`}
        customRenderers={[
          createRenderTextIconCell({ firstColumnLeftPadding: 16 }),
        ]}
        freezeColumns={1}
      />
    </Box>
  );
};
