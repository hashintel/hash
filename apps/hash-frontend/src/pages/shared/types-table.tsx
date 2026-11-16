import { GridCellKind } from "@glideapps/glide-data-grid";
import { Box, useTheme } from "@mui/material";
import { format } from "date-fns";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type DataTypeWithMetadata,
  type EntityTypeWithMetadata,
  isExternalOntologyElementMetadata,
  type PropertyTypeWithMetadata,
  type VersionedUrl,
  type WebId,
} from "@blockprotocol/type-system";
import { SortMenu } from "@hashintel/ds-components";
import { gridRowHeight } from "@local/hash-isomorphic-utils/data-grid";

import {
  Grid,
  gridHeaderHeightWithBorder,
  gridHorizontalScrollbarHeight,
  type GridSort,
} from "../../components/grid/grid";
import { useOrgs } from "../../components/hooks/use-orgs";
import { useUsers } from "../../components/hooks/use-users";
import { extractWebId } from "../../lib/user-and-org";
import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { isTypeArchived } from "../../shared/is-archived";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import { tableContentSx } from "../../shared/table-content";
import { BulkActionsDropdown } from "../../shared/table-header/bulk-actions-dropdown";
import { ExportToCsvButton } from "../../shared/table-header/export-to-csv-button";
import { generateCsvFile as buildCsvFile } from "../../shared/table-header/generate-csv-file";
import {
  isAiMachineActor,
  type MinimalActor,
  useActors,
} from "../../shared/use-actors";
import { createRenderChipCell } from "./chip-cell";
import { useDataTypesContext } from "./data-types-context";
import { DsComponentsScope } from "./ds-components-scope";
import {
  SearchPill,
  useInternalWebs,
  VisualizerHeader,
  visualizerHeaderHeight,
  WebFilterPill,
  type WebFilterState,
} from "./filter-bar";
import { QueryCount } from "./query-count";
import { useSlideStack } from "./slide-stack";
import { sortMenuTriggerChrome } from "./sort-menu-chrome";
import { TableHeaderToggle } from "./table-header-toggle";
import { createRenderTextIconCell } from "./text-icon-cell";
import { TOP_CONTEXT_BAR_HEIGHT } from "./top-context-bar";
import { TypeGraphVisualizer } from "./type-graph-visualizer";
import { TypesFilterRibbon } from "./types-table/filter-ribbon";
import {
  createTypeFilterPredicate,
  getTypeKind,
  pruneTypeFiltersForKind,
} from "./types-table/shared/type-filters";
import { TypesEmptyState } from "./types-table/types-empty-state";
import { visualizerViewIcons } from "./visualizer-views";

import type { CustomIcon } from "../../components/grid/utils/custom-grid-icons";
import type { GenerateCsvFileFunction } from "../../shared/table-header/export-to-csv-button";
import type { ChipCell } from "./chip-cell";
import type { TextIconCell } from "./text-icon-cell";
import type {
  TypeFilter,
  TypesTableKind,
  TypesTableTypeKind,
} from "./types-table/shared/type-filters";
import type { VisualizerView } from "./visualizer-views";
import type {
  Item,
  SizedGridColumn,
  TextCell,
} from "@glideapps/glide-data-grid";
import type { Sorter } from "@hashintel/ds-components";
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
  kind: TypesTableTypeKind;
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

const typesTablesToTitle: Record<TypesTableKind, string> = {
  all: "Types",
  "entity-type": "Entity Types",
  "property-type": "Property Types",
  "link-type": "Link Types",
  "data-type": "Data Types",
};

const firstColumnLeftPadding = 16;

const createEntityTypeHref = "/new/types/entity-type";

type TypesTableType =
  | EntityTypeWithMetadata
  | PropertyTypeWithMetadata
  | DataTypeWithMetadata;

const getInternalWebId = (
  type: TypesTableType,
  internalWebIds: WebId[],
): WebId | undefined =>
  !isExternalOntologyElementMetadata(type.metadata) &&
  internalWebIds.includes(type.metadata.webId)
    ? type.metadata.webId
    : undefined;

const isInWebFilter = (
  type: TypesTableType,
  webFilter: WebFilterState,
  internalWebIds: WebId[],
) => {
  const internalWebId = getInternalWebId(type, internalWebIds);

  return internalWebId
    ? webFilter.selectedInternalWebIds.has(internalWebId)
    : webFilter.includeOtherWebs;
};

const getDefaultWebFilter = (internalWebIds: WebId[]): WebFilterState => ({
  selectedInternalWebIds: new Set(internalWebIds),
  includeOtherWebs: false,
});

const defaultTypesTableSort: GridSort<TypesTableColumnId> = {
  columnKey: "title",
  direction: "asc",
};

const sortTypesTableRows = (
  rows: TypesTableRow[],
  sort: GridSort<TypesTableColumnId>,
): TypesTableRow[] =>
  rows.toSorted((a, b) => {
    const isActorSort = (key: string): key is "lastEditedBy" =>
      key === "lastEditedBy";

    const value1: string = isActorSort(sort.columnKey)
      ? (a[sort.columnKey]?.displayName ?? "")
      : String(a[sort.columnKey]);

    const value2: string = isActorSort(sort.columnKey)
      ? (b[sort.columnKey]?.displayName ?? "")
      : String(b[sort.columnKey]);

    let comparison = value1.localeCompare(value2);

    if (sort.direction === "desc") {
      comparison = -comparison;
    }

    return comparison;
  });

export const TypesTable: FunctionComponent<
  {
    loading?: boolean;
    types?: TypesTableType[];
    kind: TypesTableKind;
  } & (
    | { onlyOneWeb: true; allTypes?: never }
    | {
        onlyOneWeb?: false;
        /**
         * The types of every kind, whichever kind the table shows, to tell
         * whether the user's webs have any types at all. `undefined` while
         * they load.
         */
        allTypes: TypesTableType[] | undefined;
      }
  )
> = ({ types, allTypes, kind, onlyOneWeb, loading = false }) => {
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

  const [webFilter, setWebFilter] = useState<WebFilterState>(() =>
    getDefaultWebFilter(internalWebs.map(({ webId }) => webId)),
  );

  const [typeFilters, setTypeFilters] = useState<TypeFilter[]>([]);

  const { entityTypes, isSpecialEntityTypeLookup } =
    useEntityTypesContextRequired();
  const { dataTypes } = useDataTypesContext();

  // Filters survive tab switches, but a filter the new tab's types can never
  // match would silently hide every row — drop unavailable fields, and prune
  // inherits-from selections to the tab's type family. The family source may
  // not have loaded when the tab switches (the prune then can't classify the
  // selections), so the prune re-runs once it arrives.
  const inheritsFromFamilyLoaded =
    kind === "entity-type" || kind === "link-type"
      ? !!entityTypes
      : kind === "data-type"
        ? !!dataTypes
        : true;

  const [prunedFor, setPrunedFor] = useState(() => ({
    kind,
    familyLoaded: inheritsFromFamilyLoaded,
  }));
  if (
    kind !== prunedFor.kind ||
    (inheritsFromFamilyLoaded && !prunedFor.familyLoaded)
  ) {
    setPrunedFor({ kind, familyLoaded: inheritsFromFamilyLoaded });
    setTypeFilters((prev) =>
      pruneTypeFiltersForKind(prev, kind, { entityTypes, dataTypes }),
    );
  }

  const includeArchived = typeFilters.some(
    (filter) => filter.field === "archived",
  );

  const typeFilterPredicate = useMemo(
    () =>
      createTypeFilterPredicate(typeFilters, {
        entityTypes,
        dataTypes,
        isSpecialEntityTypeLookup,
      }),
    [typeFilters, entityTypes, dataTypes, isSpecialEntityTypeLookup],
  );

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
    const filtered: (TypesTableType & {
      isExternal: boolean;
      webShortname?: string;
      archived: boolean;
      kind: TypesTableTypeKind;
    })[] = [];

    for (const type of types ?? []) {
      const isExternal = !getInternalWebId(type, internalWebIds);

      const namespaceWebId = isExternalOntologyElementMetadata(type.metadata)
        ? undefined
        : type.metadata.webId;

      const webShortname = namespaces?.find(
        (workspace) => extractWebId(workspace) === namespaceWebId,
      )?.shortname;

      const isArchived = isTypeArchived(type);

      const webAllowed = onlyOneWeb
        ? true
        : isInWebFilter(type, webFilter, internalWebIds);

      if (
        webAllowed &&
        (includeArchived ? true : !isArchived) &&
        typeFilterPredicate(type)
      ) {
        filtered.push({
          ...type,
          isExternal,
          webShortname,
          archived: isArchived,
          kind: getTypeKind(type, isSpecialEntityTypeLookup),
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
    typeFilterPredicate,
    isSpecialEntityTypeLookup,
  ]);

  const emptyState = useMemo(() => {
    if (onlyOneWeb || !types || !allTypes || filteredTypes.length > 0) {
      return undefined;
    }

    const hasNoOwnTypes = !allTypes.some(
      (type) =>
        getInternalWebId(type, internalWebIds) !== undefined &&
        !isTypeArchived(type),
    );

    const filtersNarrowResults =
      typeFilters.length > 0 ||
      internalWebIds.some(
        (webId) => !webFilter.selectedInternalWebIds.has(webId),
      );

    const defaultWebFilter = getDefaultWebFilter(internalWebIds);

    const clearingFiltersShowsTypes =
      filtersNarrowResults &&
      types.some(
        (type) =>
          isInWebFilter(type, defaultWebFilter, internalWebIds) &&
          !isTypeArchived(type),
      );

    const widenedWebFilter = { ...webFilter, includeOtherWebs: true };

    const includingPublicTypesShowsTypes =
      !webFilter.includeOtherWebs &&
      types.some(
        (type) =>
          isInWebFilter(type, widenedWebFilter, internalWebIds) &&
          (includeArchived || !isTypeArchived(type)) &&
          typeFilterPredicate(type),
      );

    return {
      hasNoOwnTypes,
      filtersNarrowResults,
      clearingFiltersShowsTypes,
      includingPublicTypesShowsTypes,
    };
  }, [
    onlyOneWeb,
    types,
    allTypes,
    filteredTypes,
    internalWebIds,
    typeFilters,
    webFilter,
    includeArchived,
    typeFilterPredicate,
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
          kind: type.kind,
          external: type.isExternal,
          webShortname: type.webShortname,
          archived: type.archived,
        } as const;
      }),
    [actors, filteredTypes],
  );

  const [sort, setSort] = useState<GridSort<TypesTableColumnId>>(
    defaultTypesTableSort,
  );

  const activeSort = useMemo(
    () =>
      typesTableColumns.some((column) => column.id === sort.columnKey)
        ? sort
        : defaultTypesTableSort,
    [typesTableColumns, sort],
  );

  const sorters = useMemo<ReadonlyArray<Sorter<TypesTableColumnId>>>(
    () =>
      typesTableColumns.map((column) => ({
        name: column.title,
        sortKey: column.id,
        ...(column.id === "lastEdited" || column.id === "archived"
          ? { sortIcon: "generic" as const }
          : {}),
      })),
    [typesTableColumns],
  );

  const sortedRows = useMemo(
    () =>
      filteredRows ? sortTypesTableRows(filteredRows, activeSort) : undefined,
    [filteredRows, activeSort],
  );

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

  const contentTopRef = useRef<HTMLDivElement>(null);
  const [contentTop, setContentTop] = useState<number | null>(null);

  useEffect(() => {
    const el = contentTopRef.current;
    if (!el) {
      return;
    }

    const measure = () => {
      setContentTop(el.getBoundingClientRect().top);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);

  // 100vh minus the measured content top and the page container's bottom
  // padding; until measured, an estimate from the page chrome above the table.
  const maxTableHeight = `calc(100vh - ${
    contentTop != null
      ? `${contentTop}px - ${theme.spacing(5)}`
      : `(${
          HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 170 + visualizerHeaderHeight
        }px + ${theme.spacing(2)} + ${theme.spacing(5)})`
  })`;

  const emptyStateRowCount = emptyState
    ? emptyState.hasNoOwnTypes
      ? 5
      : 3
    : 1;

  const displayedRowCount =
    filteredRows && filteredRows.length > 0
      ? filteredRows.length
      : emptyStateRowCount;

  const includePublicTypes =
    emptyState?.includingPublicTypesShowsTypes === true
      ? () =>
          setWebFilter((prev) => ({
            ...prev,
            includeOtherWebs: true,
          }))
      : undefined;

  const emptyStateContent =
    !emptyState ? undefined : emptyState.hasNoOwnTypes ? (
      <TypesEmptyState
        title="No types yet"
        description="Create an entity type to describe the things you want to store, such as people or projects."
        createEntityTypeHref={createEntityTypeHref}
        onIncludePublicTypes={includePublicTypes}
      />
    ) : (
      <TypesEmptyState
        title={
          emptyState.filtersNarrowResults || webFilter.includeOtherWebs
            ? "No types match your filters"
            : `No ${typesTablesToTitle[kind].toLowerCase()} in your webs`
        }
        onClearFilters={
          emptyState.clearingFiltersShowsTypes
            ? () => {
                setTypeFilters([]);
                setWebFilter(getDefaultWebFilter(internalWebIds));
              }
            : undefined
        }
        onIncludePublicTypes={includePublicTypes}
      />
    );

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
        topLeft={
          <QueryCount
            count={filteredRows?.length}
            loading={!types || loading}
            noun={{ singular: "type", plural: "types" }}
          />
        }
        topRight={
          <>
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
          </>
        }
        bottomLeft={
          selectedTypes && selectedTypes.length > 0 ? (
            <BulkActionsDropdown
              selectedItems={selectedTypes}
              onBulkActionCompleted={() => setSelectedRows([])}
            />
          ) : (
            <TypesFilterRibbon
              leadingControls={
                <>
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
                </>
              }
              filters={typeFilters}
              setFilters={(updater) => setTypeFilters((prev) => updater(prev))}
              editors={actors}
              kind={kind}
            />
          )
        }
        bottomRight={
          view === "Table" ? (
            <DsComponentsScope>
              <SortMenu<TypesTableColumnId>
                size="xs"
                className={sortMenuTriggerChrome}
                position="bottom-end"
                items={sorters}
                value={{
                  sortKey: activeSort.columnKey,
                  direction:
                    activeSort.direction === "asc" ? "ASCENDING" : "DESCENDING",
                }}
                onChange={(sortKey, direction) =>
                  setSort({
                    columnKey: sortKey,
                    direction: direction === "ASCENDING" ? "asc" : "desc",
                  })
                }
              />
            </DsComponentsScope>
          ) : undefined
        }
      />
      <Box ref={contentTopRef} />
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
            dataLoading={
              !types ||
              loading ||
              (!onlyOneWeb && !allTypes && filteredTypes.length === 0)
            }
            enableCheckboxSelection
            firstColumnLeftPadding={firstColumnLeftPadding}
            freezeColumns={1}
            noResultsContent={emptyStateContent}
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
            rows={sortedRows}
            selectedRows={selectedRows}
            setSort={setSort}
            showSearch={showSearch}
            sort={activeSort}
            sortableColumns={[
              "title",
              "kind",
              "webShortname",
              "archived",
              "lastEdited",
              "lastEditedBy",
            ]}
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
