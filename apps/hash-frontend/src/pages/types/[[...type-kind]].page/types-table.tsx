import {
  type DataTypeWithMetadata,
  type EntityTypeWithMetadata,
  isExternalOntologyElementMetadata,
  type PropertyTypeWithMetadata,
  type VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  Item,
  SizedGridColumn,
  TextCell,
} from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { gridRowHeight } from "@local/hash-isomorphic-utils/data-grid";
import { Box, useTheme } from "@mui/material";
import { format } from "date-fns";
import { useRouter } from "next/router";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  Grid,
  gridHeaderHeightWithBorder,
  gridHorizontalScrollbarHeight,
  type GridProps,
} from "../../../components/grid/grid";
import type { CustomIcon } from "../../../components/grid/utils/custom-grid-icons";
import { useOrgs } from "../../../components/hooks/use-orgs";
import { useUsers } from "../../../components/hooks/use-users";
import { extractWebId } from "../../../lib/user-and-org";
import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { isTypeArchived } from "../../../shared/is-archived";
import { HEADER_HEIGHT } from "../../../shared/layout/layout-with-header/page-header";
import { tableContentSx } from "../../../shared/table-content";
import type { FilterState } from "../../../shared/table-header";
import { TableHeader, tableHeaderHeight } from "../../../shared/table-header";
import {
  isAiMachineActor,
  type MinimalActor,
  useActors,
} from "../../../shared/use-actors";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import type { ChipCell } from "../../shared/chip-cell";
import { createRenderChipCell } from "../../shared/chip-cell";
import type { TextIconCell } from "../../shared/entities-visualizer/entities-table/text-icon-cell";
import { createRenderTextIconCell } from "../../shared/entities-visualizer/entities-table/text-icon-cell";
import { useSlideStack } from "../../shared/slide-stack";
import { TableHeaderToggle } from "../../shared/table-header-toggle";
import { TOP_CONTEXT_BAR_HEIGHT } from "../../shared/top-context-bar";
import { TypeGraphVisualizer } from "../../shared/type-graph-visualizer";
import type { VisualizerView } from "../../shared/visualizer-views";
import { visualizerViewIcons } from "../../shared/visualizer-views";

export type TypesTableColumnId =
  | "title"
  | "kind"
  | "webShortname"
  | "archived"
  | "lastEdited"
  | "lastEditedBy";

type TypesTableColumn = {
  id: TypesTableColumnId;
} & SizedGridColumn;

export type TypesTableRow = {
  rowId: string;
  kind: "entity-type" | "property-type" | "link-type" | "data-type";
  lastEdited: string;
  lastEditedBy?: MinimalActor;
  icon?: string;
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

type TypeTableKind =
  | "all"
  | "entity-type"
  | "link-type"
  | "property-type"
  | "data-type";

const typesTablesToTitle: Record<TypeTableKind, string> = {
  all: "Types",
  "entity-type": "Entity Types",
  "property-type": "Property Types",
  "link-type": "Link Types",
  "data-type": "Data Types",
};

const firstColumnLeftPadding = 16;

export const TypesTable: FunctionComponent<{
  types?: (
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  kind: TypeTableKind;
}> = ({ types, kind }) => {
  const router = useRouter();

  const [view, setView] = useState<VisualizerView>("Table");

  const [showSearch, setShowSearch] = useState<boolean>(false);

  const [selectedRows, setSelectedRows] = useState<TypesTableRow[]>([]);

  const [filterState, setFilterState] = useState<FilterState>({
    includeArchived: false,
    includeGlobal: false,
    limitToWebs: false,
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
      ...(filterState.includeArchived
        ? [
            {
              id: "archived",
              title: "Archived",
              width: 200,
            } as const,
          ]
        : []),
      {
        title: "Last Edited",
        id: "lastEdited",
        width: 200,
      },
      {
        title: "Last Edited By",
        id: "lastEditedBy",
        width: 200,
      },
    ],
    [filterState.includeArchived, kind],
  );

  const currentlyDisplayedColumnsRef = useRef<TypesTableColumn[] | null>(null);
  currentlyDisplayedColumnsRef.current = typesTableColumns;

  const { users } = useUsers();
  const { orgs } = useOrgs();

  const editorActorIds = useMemo(
    () =>
      types?.flatMap(({ metadata }) => [
        metadata.provenance.edition.createdById,
      ]),
    [types],
  );

  const { actors } = useActors({ accountIds: editorActorIds });

  const namespaces = useMemo(
    () => (users && orgs ? [...users, ...orgs] : undefined),
    [users, orgs],
  );

  const { authenticatedUser } = useAuthenticatedUser();

  const internalWebIds = useMemo(() => {
    return [
      authenticatedUser.accountId,
      ...authenticatedUser.memberOf.map(({ org }) => org.webId),
    ];
  }, [authenticatedUser]);

  const filteredTypes = useMemo(() => {
    const filtered: ((
      | EntityTypeWithMetadata
      | PropertyTypeWithMetadata
      | DataTypeWithMetadata
    ) & { isExternal: boolean; webShortname?: string; archived: boolean })[] =
      [];

    for (const type of types ?? []) {
      const isExternal = isExternalOntologyElementMetadata(type.metadata)
        ? true
        : !internalWebIds.includes(type.metadata.webId);

      const namespaceWebId = isExternalOntologyElementMetadata(type.metadata)
        ? undefined
        : type.metadata.webId;

      const webShortname = namespaces?.find(
        (workspace) => extractWebId(workspace) === namespaceWebId,
      )?.shortname;

      const isArchived = isTypeArchived(type);

      if (
        (filterState.includeGlobal ? true : !isExternal) &&
        (filterState.includeArchived ? true : !isArchived) &&
        (filterState.limitToWebs
          ? webShortname && filterState.limitToWebs.includes(webShortname)
          : true)
      ) {
        filtered.push({
          ...type,
          isExternal,
          webShortname,
          archived: isArchived,
        });
      }
    }

    return filtered;
  }, [types, filterState, namespaces, internalWebIds]);

  const filteredRows = useMemo<TypesTableRow[] | undefined>(
    () =>
      filteredTypes.map((type) => {
        const lastEdited = format(
          new Date(
            type.metadata.temporalVersioning.transactionTime.start.limit,
          ),
          "yyyy-MM-dd HH:mm",
        );

        const lastEditedBy = actors?.find(
          ({ accountId }) =>
            accountId === type.metadata.provenance.edition.createdById,
        );

        return {
          rowId: type.schema.$id,
          typeId: type.schema.$id,
          title: type.schema.title,
          icon: "icon" in type.schema ? type.schema.icon : undefined,
          lastEdited,
          lastEditedBy,
          kind:
            type.schema.kind === "entityType"
              ? isSpecialEntityTypeLookup?.[type.schema.$id]?.isFile
                ? "link-type"
                : "entity-type"
              : type.schema.kind === "propertyType"
                ? "property-type"
                : "data-type",
          external: type.isExternal,
          webShortname: type.webShortname,
          archived: type.archived,
        } as const;
      }),
    [actors, isSpecialEntityTypeLookup, filteredTypes],
  );

  const sortRows = useCallback<
    NonNullable<
      GridProps<TypesTableRow, TypesTableColumn, TypesTableColumnId>["sortRows"]
    >
  >((unsortedRows, sort) => {
    return unsortedRows.toSorted((a, b) => {
      const isActorSort = (key: string): key is "lastEditedBy" | "createdBy" =>
        ["lastEditedBy", "createdBy"].includes(key);

      const value1: string = isActorSort(sort.columnKey)
        ? (a[sort.columnKey]?.displayName ?? "")
        : String(a[sort.columnKey]);

      const value2: string = isActorSort(sort.columnKey)
        ? (b[sort.columnKey]?.displayName ?? "")
        : String(b[sort.columnKey]);

      let comparison = value1.localeCompare(value2);

      if (sort.direction === "desc") {
        // reverse if descending
        comparison = -comparison;
      }

      return comparison;
    });
  }, []);

  const { pushToSlideStack } = useSlideStack();

  const theme = useTheme();

  const createGetCellContent = useCallback(
    (rows: TypesTableRow[]) =>
      ([colIndex, rowIndex]: Item): TextCell | TextIconCell | ChipCell => {
        const row = rows[rowIndex];

        if (!row) {
          throw new Error("row not found");
        }

        const column = typesTableColumns[colIndex];

        if (!column) {
          throw new Error("column not found");
        }

        switch (column.id) {
          case "title": {
            const isClickable =
              row.kind === "entity-type" ||
              row.kind === "link-type" ||
              row.kind === "data-type";

            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: false,
              copyData: row.title,
              cursor: isClickable ? "pointer" : "default",
              data: {
                kind: "chip-cell",
                chips: [
                  {
                    icon: row.icon
                      ? { entityTypeIcon: row.icon }
                      : {
                          inbuiltIcon:
                            row.kind === "link-type" ? "bpLink" : "bpAsterisk",
                        },
                    text: row.title,
                    onClick: isClickable
                      ? () => {
                          pushToSlideStack({
                            kind:
                              row.kind === "data-type"
                                ? "dataType"
                                : "entityType",
                            itemId: row.typeId,
                          });
                        }
                      : undefined,
                    iconFill: theme.palette.blue[70],
                  },
                ],
                color: "white",
                variant: "outlined",
              },
            };
          }
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

            const isClickable = row.webShortname !== undefined;

            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              cursor: isClickable ? "pointer" : "default",
              copyData: value,
              data: {
                kind: "text-icon-cell",
                icon: null,
                value,
                onClick: isClickable
                  ? () => {
                      void router.push(`/${value}`);
                    }
                  : undefined,
              },
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
          case "lastEdited": {
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(row.lastEdited),
              data: row.lastEdited,
            };
          }
          case "lastEditedBy": {
            const actor = row.lastEditedBy;

            const actorName = actor ? actor.displayName : undefined;

            const actorIcon = actor
              ? ((actor.kind === "machine"
                  ? isAiMachineActor(actor)
                    ? "wandMagicSparklesRegular"
                    : "hashSolid"
                  : "userRegular") satisfies CustomIcon)
              : undefined;

            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: false,
              copyData: String(actorName),
              data: {
                kind: "chip-cell",
                chips: actorName
                  ? [
                      {
                        text: actorName,
                        icon: actorIcon
                          ? { inbuiltIcon: actorIcon }
                          : undefined,
                      },
                    ]
                  : [],
                color: "gray",
                variant: "filled",
              },
            };
          }
        }
      },
    [typesTableColumns, pushToSlideStack, router, theme],
  );

  const maxTableHeight = `calc(100vh - (${
    HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 170 + tableHeaderHeight
  }px + ${theme.spacing(5)}) - ${theme.spacing(5)})`;

  const currentlyDisplayedRowsRef = useRef<TypesTableRow[] | null>(null);

  const onTypeClick = useCallback(
    (typeId: VersionedUrl) => {
      pushToSlideStack({
        kind: "entityType",
        itemId: typeId,
      });
    },
    [pushToSlideStack],
  );

  const numberOfUserWebItems = useMemo(
    () =>
      types?.filter(({ metadata }) =>
        isExternalOntologyElementMetadata(metadata)
          ? false
          : internalWebIds.includes(metadata.webId),
      ).length,
    [types, internalWebIds],
  );

  const numberOfExternalItems =
    types && typeof numberOfUserWebItems !== "undefined"
      ? types.length - numberOfUserWebItems
      : undefined;

  return (
    <Box>
      <TableHeader
        endAdornment={
          <TableHeaderToggle
            value={view}
            setValue={setView}
            options={(
              ["Table", "Graph"] as const satisfies VisualizerView[]
            ).map((optionValue) => ({
              icon: visualizerViewIcons[optionValue],
              label: `${optionValue} view`,
              value: optionValue,
            }))}
          />
        }
        itemLabelPlural="types"
        title={typesTablesToTitle[kind]}
        currentlyDisplayedColumnsRef={currentlyDisplayedColumnsRef}
        currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
        filterState={filterState}
        loading={false}
        numberOfExternalItems={numberOfExternalItems}
        numberOfUserWebItems={numberOfUserWebItems}
        setFilterState={setFilterState}
        selectedItems={types?.filter((type) =>
          selectedRows.some(({ typeId }) => type.schema.$id === typeId),
        )}
        onBulkActionCompleted={() => setSelectedRows([])}
      />
      {view === "Table" ? (
        <Box sx={tableContentSx}>
          <Grid
            columns={typesTableColumns}
            createGetCellContent={createGetCellContent}
            currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
            customRenderers={[
              createRenderTextIconCell({ firstColumnLeftPadding }),
              createRenderChipCell({ firstColumnLeftPadding }),
            ]}
            dataLoading={!types}
            enableCheckboxSelection
            firstColumnLeftPadding={firstColumnLeftPadding}
            freezeColumns={1}
            height={`min(
                ${maxTableHeight},
                calc(
                  ${gridHeaderHeightWithBorder}px +
                  (${
                    filteredRows?.length ? filteredRows.length : 1
                  } * ${gridRowHeight}px) +
                  ${gridHorizontalScrollbarHeight}px
                )
              )`}
            onSearchClose={() => setShowSearch(false)}
            onSelectedRowsChange={(updatedSelectedRows) =>
              setSelectedRows(updatedSelectedRows)
            }
            rows={filteredRows}
            selectedRows={selectedRows}
            showSearch={showSearch}
            sortableColumns={[
              "title",
              "kind",
              "webShortname",
              "archived",
              "lastEdited",
              "lastEditedBy",
            ]}
            sortRows={sortRows}
          />
        </Box>
      ) : (
        <Box height={maxTableHeight} sx={tableContentSx}>
          <TypeGraphVisualizer
            onTypeClick={onTypeClick}
            types={filteredTypes}
          />
        </Box>
      )}
    </Box>
  );
};
