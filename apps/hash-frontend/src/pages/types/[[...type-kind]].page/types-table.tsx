import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  Item,
  SizedGridColumn,
  TextCell,
} from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { isExternalOntologyElementMetadata } from "@local/hash-subgraph";
import { Box, useTheme } from "@mui/material";
import { useRouter } from "next/router";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

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
import { generateLinkParameters } from "../../../shared/generate-link-parameters";
import { isTypeArchived } from "../../../shared/is-archived";
import { HEADER_HEIGHT } from "../../../shared/layout/layout-with-header/page-header";
import type { FilterState } from "../../../shared/table-header";
import { TableHeader, tableHeaderHeight } from "../../../shared/table-header";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import type { TextIconCell } from "../../shared/entities-table/text-icon-cell";
import { createRenderTextIconCell } from "../../shared/entities-table/text-icon-cell";
import { TOP_CONTEXT_BAR_HEIGHT } from "../../shared/top-context-bar";

const typesTableColumnIds = [
  "title",
  "kind",
  "webShortname",
  "archived",
] as const;

type LinkColumnId = (typeof typesTableColumnIds)[number];

type TypesTableColumn = {
  id: LinkColumnId;
} & SizedGridColumn;

export type TypesTableRow = {
  rowId: string;
  kind: "entity-type" | "property-type" | "link-type" | "data-type";
  typeId: VersionedUrl;
  title: string;
  external: boolean;
  webShortname?: string;
  archived: boolean;
};

const typeNamespaceFromTypeId = (typeId: VersionedUrl): string => {
  const url = new URL(typeId);
  const domain = url.hostname;
  const firstPathSegment = url.pathname.split("/")[1];
  return `${domain}/${firstPathSegment}`;
};

const typeTableKinds = [
  "all",
  "entity-type",
  "link-type",
  "property-type",
  "data-type",
] as const;

type TypeTableKind = (typeof typeTableKinds)[number];

const typesTablesToTitle: Record<TypeTableKind, string> = {
  all: "Types",
  "entity-type": "Entity Types",
  "property-type": "Property Types",
  "link-type": "Link Types",
  "data-type": "Data Types",
};

export const TypesTable: FunctionComponent<{
  types?: (
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  kind: TypeTableKind;
}> = ({ types, kind }) => {
  const router = useRouter();

  const [showSearch, setShowSearch] = useState<boolean>(false);

  const [selectedRows, setSelectedRows] = useState<TypesTableRow[]>([]);

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
        id: "webShortname",
        title: "Web",
        width: 280,
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

  const { authenticatedUser } = useAuthenticatedUser();

  const internalWebIds = useMemo(() => {
    return [
      authenticatedUser.accountId,
      ...authenticatedUser.memberOf.map(({ org }) => org.accountGroupId),
    ];
  }, [authenticatedUser]);

  const filteredRows = useMemo<TypesTableRow[] | undefined>(
    () =>
      types
        ?.map((type) => {
          const isExternal = isExternalOntologyElementMetadata(type.metadata)
            ? true
            : !internalWebIds.includes(type.metadata.ownedById);

          const namespaceOwnedById = isExternalOntologyElementMetadata(
            type.metadata,
          )
            ? undefined
            : type.metadata.ownedById;

          const webShortname = namespaces?.find(
            (workspace) => extractOwnedById(workspace) === namespaceOwnedById,
          )?.shortname;

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
            webShortname,
            archived: isTypeArchived(type),
          } as const;
        })
        .filter(
          ({ external, archived }) =>
            (filterState.includeGlobal ? true : !external) &&
            (filterState.includeArchived ? true : !archived),
        ),
    [internalWebIds, isSpecialEntityTypeLookup, types, namespaces, filterState],
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
                onClick: () =>
                  router.push(generateLinkParameters(row.typeId).href),
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
          case "webShortname": {
            const value = row.webShortname
              ? `@${row.webShortname}`
              : typeNamespaceFromTypeId(row.typeId);

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

  const currentlyDisplayedRowsRef = useRef<TypesTableRow[] | null>(null);

  return (
    <Box>
      <TableHeader
        internalWebIds={internalWebIds}
        itemLabelPlural="types"
        items={types}
        title={typesTablesToTitle[kind]}
        columns={typesTableColumns}
        currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
        filterState={filterState}
        setFilterState={setFilterState}
        selectedItems={types?.filter((type) =>
          selectedRows.some(({ typeId }) => type.schema.$id === typeId),
        )}
        onBulkActionCompleted={() => setSelectedRows([])}
      />
      <Grid
        showSearch={showSearch}
        onSearchClose={() => setShowSearch(false)}
        columns={typesTableColumns}
        dataLoading={!types}
        rows={filteredRows}
        enableCheckboxSelection
        selectedRows={selectedRows}
        currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
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
              (${filteredRows ? filteredRows.length : 1} * ${gridRowHeight}px) +
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
