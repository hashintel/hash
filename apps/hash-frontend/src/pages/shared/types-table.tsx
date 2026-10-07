import { GridCellKind } from "@glideapps/glide-data-grid";
import { Box, Stack, useTheme } from "@mui/material";
import { format } from "date-fns";
import { useRouter } from "next/router";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  type DataTypeWithMetadata,
  type EntityTypeWithMetadata,
  isExternalOntologyElementMetadata,
  type PropertyTypeWithMetadata,
  type VersionedUrl,
} from "@blockprotocol/type-system";
import { LoadingSpinner } from "@hashintel/design-system";
import { gridRowHeight } from "@local/hash-isomorphic-utils/data-grid";

import {
  Grid,
  gridHeaderHeightWithBorder,
  gridHorizontalScrollbarHeight,
  type GridProps,
} from "../../components/grid/grid";
import { useOrgs } from "../../components/hooks/use-orgs";
import { useUsers } from "../../components/hooks/use-users";
import { extractWebId } from "../../lib/user-and-org";
import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { isTypeArchived } from "../../shared/is-archived";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import { tableContentSx } from "../../shared/table-content";
import { CheckboxFilter, tableHeaderHeight } from "../../shared/table-header";
import { BulkActionsDropdown } from "../../shared/table-header/bulk-actions-dropdown";
import { ExportToCsvButton } from "../../shared/table-header/export-to-csv-button";
import { generateCsvFile as buildCsvFile } from "../../shared/table-header/generate-csv-file";
import {
  isAiMachineActor,
  type MinimalActor,
  useActors,
} from "../../shared/use-actors";
import { createRenderChipCell } from "./chip-cell";
import {
  SearchPill,
  useInternalWebs,
  VisualizerHeader,
  WebFilterPill,
  type WebFilterState,
} from "./filter-bar";
import { useSlideStack } from "./slide-stack";
import { TableHeaderToggle } from "./table-header-toggle";
import { createRenderTextIconCell } from "./text-icon-cell";
import { TOP_CONTEXT_BAR_HEIGHT } from "./top-context-bar";
import { TypeGraphVisualizer } from "./type-graph-visualizer";
import { visualizerViewIcons } from "./visualizer-views";

import type { CustomIcon } from "../../components/grid/utils/custom-grid-icons";
import type { GenerateCsvFileFunction } from "../../shared/table-header/export-to-csv-button";
import type { ChipCell } from "./chip-cell";
import type { TextIconCell } from "./text-icon-cell";
import type { VisualizerView } from "./visualizer-views";
import type {
  Item,
  SizedGridColumn,
  TextCell,
} from "@glideapps/glide-data-grid";
import type { FunctionComponent } from "react";

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
  loading?: boolean;
  onlyOneWeb?: boolean;
  types?: (
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata
  )[];
  kind: TypeTableKind;
}> = ({ types, kind, onlyOneWeb, loading = false }) => {
  const router = useRouter();

  const [view, _setView] = useState<VisualizerView>("Table");

  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [showGraphSearch, setShowGraphSearch] = useState<boolean>(false);

  const setView = useCallback((newView: VisualizerView) => {
    _setView(newView);
    setShowSearch(false);
    setShowGraphSearch(false);
  }, []);

  const [selectedRows, setSelectedRows] = useState<TypesTableRow[]>([]);

  const internalWebs = useInternalWebs();

  const [webFilter, setWebFilter] = useState<WebFilterState>(() => ({
    selectedInternalWebIds: new Set(internalWebs.map(({ webId }) => webId)),
    includeOtherWebs: false,
  }));

  const [includeArchived, setIncludeArchived] = useState(false);

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
      ...(onlyOneWeb
        ? []
        : [
            {
              id: "webShortname",
              title: "Web",
              width: 280,
            } as const,
          ]),
      ...(includeArchived
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
    [includeArchived, kind, onlyOneWeb],
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

  const internalWebIds = useMemo(
    () => internalWebs.map(({ webId }) => webId),
    [internalWebs],
  );

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

      // A type in one of the user's own webs follows that web's checkbox in
      // the web dropdown; every other type follows "Other webs".
      const webAllowed = onlyOneWeb
        ? true
        : !isExternal && namespaceWebId !== undefined
          ? webFilter.selectedInternalWebIds.has(namespaceWebId)
          : webFilter.includeOtherWebs;

      if (webAllowed && (includeArchived ? true : !isArchived)) {
        filtered.push({
          ...type,
          isExternal,
          webShortname,
          archived: isArchived,
        });
      }
    }

    return filtered;
  }, [
    types,
    webFilter,
    includeArchived,
    namespaces,
    internalWebIds,
    onlyOneWeb,
  ]);

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

  const displayedRowCount = Math.max(filteredRows?.length ?? 1, 1);

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

  const generateCsvFile = useCallback<GenerateCsvFileFunction>(() => {
    const currentlyDisplayedRows = currentlyDisplayedRowsRef.current;
    const currentlyDisplayedColumns = currentlyDisplayedColumnsRef.current;
    if (!currentlyDisplayedRows || !currentlyDisplayedColumns) {
      return null;
    }
    return buildCsvFile({
      columns: currentlyDisplayedColumns,
      rows: currentlyDisplayedRows,
      title: typesTablesToTitle[kind],
    });
  }, [kind]);

  const selectedTypes = types?.filter((type) =>
    selectedRows.some(({ typeId }) => type.schema.$id === typeId),
  );

  // Stable identity: a fresh object would re-render the memoized graph on
  // every table render.
  const graphSearchPanel = useMemo(
    () => ({
      open: showGraphSearch,
      onClose: () => setShowGraphSearch(false),
    }),
    [showGraphSearch],
  );

  return (
    <Box>
      <VisualizerHeader
        bottomLeft={
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            gap={1}
          >
            {selectedTypes && selectedTypes.length > 0 ? (
              <BulkActionsDropdown
                selectedItems={selectedTypes}
                onBulkActionCompleted={() => setSelectedRows([])}
              />
            ) : (
              <Stack direction="row" alignItems="center" gap={1}>
                <SearchPill
                  title={
                    view === "Table"
                      ? "Search for text in visible rows"
                      : "Search for a type in the graph"
                  }
                  onClick={() => {
                    if (view === "Table") {
                      setShowSearch(!showSearch);
                    } else {
                      setShowGraphSearch(!showGraphSearch);
                    }
                  }}
                />
                {onlyOneWeb ? null : (
                  <WebFilterPill
                    internalWebs={internalWebs}
                    webState={webFilter}
                    setWebState={(updater) =>
                      setWebFilter((prev) => updater(prev))
                    }
                  />
                )}
                <CheckboxFilter
                  label="Include archived"
                  checked={includeArchived}
                  onChange={setIncludeArchived}
                />
                {loading && (
                  <LoadingSpinner size={16} color={theme.palette.blue[70]} />
                )}
              </Stack>
            )}
            <Stack direction="row" alignItems="center" gap={1}>
              {view === "Table" ? (
                <ExportToCsvButton
                  generateCsvFile={generateCsvFile}
                  sx={{ px: 1.5, borderRadius: "4px" }}
                />
              ) : null}
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
            </Stack>
          </Stack>
        }
      />
      {view === "Table" ? (
        <Box
          sx={[
            tableContentSx,
            {
              "@keyframes types-table-search-in": {
                from: { transform: "translateX(-400px)" },
                to: { transform: "translateX(0)" },
              },
              "@keyframes types-table-search-out": {
                from: { transform: "translateX(0)" },
                to: { transform: "translateX(-400px)" },
              },
              "& .gdg-seveqep": {
                right: "auto",
                left: 20,
                animationName: "types-table-search-in",
              },
              "& .gdg-seveqep.out": {
                animationName: "types-table-search-out",
              },
            },
          ]}
        >
          <Grid
            columns={typesTableColumns}
            createGetCellContent={createGetCellContent}
            currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
            customRenderers={[
              createRenderTextIconCell({ firstColumnLeftPadding }),
              createRenderChipCell({ firstColumnLeftPadding }),
            ]}
            dataLoading={!types || loading}
            enableCheckboxSelection
            firstColumnLeftPadding={firstColumnLeftPadding}
            freezeColumns={1}
            height={`min(
                ${maxTableHeight},
                calc(
                  ${gridHeaderHeightWithBorder}px +
                  (${displayedRowCount} * ${gridRowHeight}px) +
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
            searchPanel={graphSearchPanel}
            types={filteredTypes}
          />
        </Box>
      )}
    </Box>
  );
};
