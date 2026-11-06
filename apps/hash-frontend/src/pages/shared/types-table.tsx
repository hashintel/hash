import { GridCellKind } from "@glideapps/glide-data-grid";
import { Box, Stack, Typography, useTheme } from "@mui/material";
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
import { faListTree, FontAwesomeIcon } from "@hashintel/design-system";
import { SortMenu } from "@hashintel/ds-components";
import { gridRowHeight } from "@local/hash-isomorphic-utils/data-grid";

import {
  Grid,
  gridHeaderHeightWithBorder,
  gridHorizontalScrollbarHeight,
  type GridSort,
} from "../../components/grid/grid";
import { getCellSearchableText } from "../../components/grid/utils";
import { useGridTooltip } from "../../components/grid/utils/use-grid-tooltip";
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
import { Button } from "../../shared/ui/button";
import {
  isAiMachineActor,
  type MinimalActor,
  useActors,
} from "../../shared/use-actors";
import { createRenderChipCell } from "./chip-cell";
import { DataTypeEditorDrawer } from "./data-type-editor-drawer";
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
import { DataTypeLabelTooltip } from "./types-table/data-type-label-tooltip";
import {
  buildDataTypeTree,
  type DataTypeTreePosition,
} from "./types-table/data-type-tree";
import {
  renderDataTypeTreeCell,
  type DataTypeTreeCell,
} from "./types-table/data-type-tree-cell";
import { TypesFilterRibbon } from "./types-table/filter-ribbon";
import {
  getDataTypeLabelPreview,
  type DataTypeLabelPart,
} from "./types-table/shared/data-type-label-preview";
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
  DataEditorRef,
  Item,
  SizedGridColumn,
  TextCell,
} from "@glideapps/glide-data-grid";
import type { Sorter } from "@hashintel/ds-components";
import type { FunctionComponent } from "react";

export type { TypesTableTypeKind } from "./types-table/shared/type-filters";

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
  parentIds: VersionedUrl[];
  hierarchy?: DataTypeTreePosition;
  title: string;
  labelPreview?: DataTypeLabelPart[];
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

const typeKindLabels: Record<TypesTableTypeKind, string> = {
  "entity-type": "Entity Type",
  "link-type": "Link Type",
  "property-type": "Property Type",
  "data-type": "Data Type",
};

const firstColumnLeftPadding = 4;

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
    initialKindFilter?: TypesTableTypeKind;
  } & (
    | { onlyOneWeb: true; allTypes?: never }
    | {
        onlyOneWeb?: false;
        /**
         * The types of every kind, whichever kind the table shows, to tell
         * whether the user's webs have any types at all. `undefined` while
         * they load, and `null` if some of them could not be loaded.
         */
        allTypes: TypesTableType[] | null | undefined;
      }
  )
> = ({
  types,
  allTypes,
  kind,
  onlyOneWeb,
  loading = false,
  initialKindFilter,
}) => {
  const router = useRouter();
  const gridRef = useRef<DataEditorRef>(null);
  const { tooltipElement, showTooltip } = useGridTooltip(gridRef);

  const [view, _setView] = useState<VisualizerView>("Table");

  const [dataTypeLayout, setDataTypeLayout] = useState<"Nested" | "Flat">(
    "Nested",
  );
  const hierarchical = kind === "data-type" && dataTypeLayout === "Nested";
  const [searchValue, setSearchValue] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedSearchRows, setCollapsedSearchRows] = useState<Set<string>>(
    () => new Set(),
  );
  const onSearchValueChange = useCallback((value: string) => {
    setSearchValue(value);
    setCollapsedSearchRows(new Set());
  }, []);

  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [showGraphSearch, setShowGraphSearch] = useState<boolean>(false);

  const setView = useCallback((newView: VisualizerView) => {
    _setView(newView);
    setShowSearch(false);
    setShowGraphSearch(false);
    setSearchValue("");
  }, []);

  const [selectedRows, setSelectedRows] = useState<TypesTableRow[]>([]);

  const internalWebs = useInternalWebs();

  const [webFilter, setWebFilter] = useState<WebFilterState>(() =>
    getDefaultWebFilter(internalWebs.map(({ webId }) => webId)),
  );

  const [typeFilters, setTypeFilters] = useState<TypeFilter[]>(() =>
    initialKindFilter
      ? [
          {
            id: "initial-kind",
            field: "kind",
            operator: "anyOf",
            values: [initialKindFilter],
          },
        ]
      : [],
  );

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
        width: kind === "data-type" ? 480 : 252,
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
    if (
      onlyOneWeb ||
      !types ||
      allTypes === undefined ||
      filteredTypes.length > 0
    ) {
      return undefined;
    }

    const hasNoOwnTypes =
      allTypes !== null &&
      !allTypes.some(
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
          labelPreview:
            kind === "data-type" && type.schema.kind === "dataType"
              ? getDataTypeLabelPreview(type.schema, dataTypes ?? {})
              : undefined,
          parentIds:
            type.schema.kind === "dataType"
              ? (type.schema.allOf ?? []).map(({ $ref }) => $ref)
              : [],
          icon: "icon" in type.schema ? type.schema.icon : undefined,
          lastEdited,
          lastEditedBy,
          kind: type.kind,
          external: type.isExternal,
          webShortname: type.webShortname,
          archived: type.archived,
        } as const;
      }),
    [actors, filteredTypes, kind, dataTypes],
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

  const treeSearchValue = kind === "data-type" && showSearch ? searchValue : "";
  const toggleRow = useCallback(
    (rowId: string) => {
      const setRows = treeSearchValue
        ? setCollapsedSearchRows
        : setExpandedRows;
      setRows((previous) => {
        const next = new Set(previous);
        if (next.has(rowId)) {
          next.delete(rowId);
        } else {
          next.add(rowId);
        }
        return next;
      });
    },
    [treeSearchValue],
  );

  const { pushToSlideStack } = useSlideStack();

  const theme = useTheme();

  const [dataTypeBeingEdited, setDataTypeBeingEdited] =
    useState<DataTypeWithMetadata | null>(null);

  /**
   * Data types the user can edit open the editor drawer; everything else
   * (external webs, entity types) opens the read-only slide.
   */
  const openType = useCallback(
    (rowKind: TypesTableRow["kind"], typeId: VersionedUrl) => {
      if (rowKind === "data-type") {
        const dataType = dataTypes?.[typeId];
        const typeWebId =
          dataType && "webId" in dataType.metadata
            ? dataType.metadata.webId
            : null;

        if (dataType && internalWebs.some(({ webId }) => webId === typeWebId)) {
          setDataTypeBeingEdited(dataType);
          return;
        }
      }

      pushToSlideStack({
        kind: rowKind === "data-type" ? "dataType" : "entityType",
        itemId: typeId,
      });
    },
    [dataTypes, internalWebs, pushToSlideStack],
  );

  const createGetCellContent = useCallback(
    (rows: TypesTableRow[]) =>
      ([colIndex, rowIndex]: Item):
        | TextCell
        | TextIconCell
        | ChipCell
        | DataTypeTreeCell => {
        const row = rows[rowIndex];

        if (!row) {
          throw new Error("row not found");
        }

        const column = typesTableColumns[colIndex];

        if (!column) {
          throw new Error("column not found");
        }

        const themeOverride =
          row.hierarchy?.matchesSearch === false
            ? {
                textDark: theme.palette.gray[70],
                textHeader: theme.palette.gray[70],
              }
            : undefined;

        switch (column.id) {
          case "title": {
            const copyData = [
              row.title,
              row.labelPreview?.map(({ text }) => text).join(""),
            ]
              .filter(Boolean)
              .join(" ");
            if (kind === "data-type") {
              return {
                kind: GridCellKind.Custom,
                themeOverride,
                readonly: true,
                allowOverlay: false,
                copyData,
                cursor: "pointer",
                data: {
                  kind: "data-type-tree-cell",
                  hierarchical,
                  leftPadding: firstColumnLeftPadding,
                  title: row.title,
                  labelPreview: row.labelPreview,
                  showLabelExample: (tooltip) => {
                    const schema = dataTypes?.[row.typeId]?.schema;
                    if (schema) {
                      showTooltip({
                        ...tooltip,
                        colIndex,
                        rowIndex,
                        content: (
                          <DataTypeLabelTooltip
                            schema={schema}
                            dataTypes={dataTypes}
                          />
                        ),
                      });
                    }
                  },
                  icon: row.icon,
                  ...(row.hierarchy ?? {
                    depth: 0,
                    continuationDepths: [],
                    hasNextSibling: false,
                    expanded: false,
                    hasChildren: false,
                  }),
                  muted: row.hierarchy?.matchesSearch === false,
                  onToggle: () => toggleRow(row.rowId),
                  onOpen: () =>
                    pushToSlideStack({ kind: "dataType", itemId: row.typeId }),
                },
              };
            }
            const isClickable =
              row.kind === "entity-type" ||
              row.kind === "link-type" ||
              row.kind === "data-type";

            return {
              kind: GridCellKind.Custom,
              themeOverride,
              readonly: true,
              allowOverlay: false,
              copyData,
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
                          openType(row.kind, row.typeId);
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
              themeOverride,
              readonly: true,
              allowOverlay: false,
              displayData: typeKindLabels[row.kind],
              data: typeKindLabels[row.kind],
            };
          case "webShortname": {
            const value = row.webShortname
              ? `@${row.webShortname}`
              : typeNamespaceFromTypeId(row.typeId);

            const isClickable = row.webShortname !== undefined;

            return {
              kind: GridCellKind.Custom,
              themeOverride,
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
              themeOverride,
              readonly: true,
              allowOverlay: false,
              displayData: String(value),
              data: value,
            };
          }
          case "lastEdited": {
            return {
              kind: GridCellKind.Text,
              themeOverride,
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
              themeOverride,
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
    [
      typesTableColumns,
      openType,
      pushToSlideStack,
      router,
      theme,
      toggleRow,
      kind,
      dataTypes,
      showTooltip,
      hierarchical,
    ],
  );

  const matchingIds = useMemo(() => {
    if (!treeSearchValue) {
      return undefined;
    }
    const rows = sortedRows ?? [];
    const getCellContent = createGetCellContent(rows);
    const query = treeSearchValue.toLowerCase();
    return new Set(
      rows
        .filter((_row, rowIndex) =>
          typesTableColumns.some((_column, colIndex) =>
            getCellSearchableText(getCellContent([colIndex, rowIndex]))
              ?.toLowerCase()
              .includes(query),
          ),
        )
        .map(({ typeId }) => typeId),
    );
  }, [treeSearchValue, sortedRows, createGetCellContent, typesTableColumns]);

  const tree = useMemo(
    () =>
      hierarchical
        ? buildDataTypeTree({
            rows: sortedRows ?? [],
            expandedRows,
            matchingIds,
            collapsedSearchRows,
          })
        : undefined,
    [hierarchical, sortedRows, expandedRows, matchingIds, collapsedSearchRows],
  );
  const visibleRows = useMemo(
    () =>
      tree?.rows ??
      sortedRows?.filter((row) => !matchingIds || matchingIds.has(row.typeId)),
    [tree, sortedRows, matchingIds],
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
    visibleRows && visibleRows.length > 0
      ? visibleRows.length
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
    const rowsToExport =
      kind === "data-type"
        ? sortedRows?.filter(
            (row) => !matchingIds || matchingIds.has(row.typeId),
          )
        : currentlyDisplayedRowsRef.current;
    const currentlyDisplayedColumns = currentlyDisplayedColumnsRef.current;
    if (!rowsToExport || !currentlyDisplayedColumns) {
      return null;
    }
    return buildCsvFile({
      columns: currentlyDisplayedColumns,
      rows: rowsToExport,
      title: typesTablesToTitle[kind],
      resolveCell: (key, row) =>
        key === "kind" ? typeKindLabels[row.kind] : undefined,
    });
  }, [sortedRows, matchingIds, kind]);

  const selectedTypes = types?.filter((type) =>
    selectedRows.some(({ typeId }) => type.schema.$id === typeId),
  );

  const onSelectedRowsChange = useCallback(
    (updatedRows: TypesTableRow[]) => {
      if (kind !== "data-type") {
        setSelectedRows(updatedRows);
        return;
      }
      const visibleIds = new Set(visibleRows?.map(({ typeId }) => typeId));
      const filteredTypeIds = new Set(sortedRows?.map(({ typeId }) => typeId));
      setSelectedRows((previous) => {
        const selectedIds = new Set(previous.map(({ typeId }) => typeId));
        const updatedRowIds = new Set(updatedRows.map(({ rowId }) => rowId));
        const deselectedTypeIds = new Set(
          visibleRows
            ?.filter(
              ({ rowId, typeId }) =>
                selectedIds.has(typeId) && !updatedRowIds.has(rowId),
            )
            .map(({ typeId }) => typeId),
        );
        return [
          ...previous.filter(
            ({ typeId }) =>
              !visibleIds.has(typeId) && filteredTypeIds.has(typeId),
          ),
          ...new Map(
            updatedRows
              .filter(({ typeId }) => !deselectedTypeIds.has(typeId))
              .map((row) => [row.typeId, row]),
          ).values(),
        ];
      });
    },
    [kind, visibleRows, sortedRows],
  );

  const selectedVisibleRows = useMemo(() => {
    if (kind !== "data-type") {
      return selectedRows;
    }
    const selectedIds = new Set(selectedRows.map(({ typeId }) => typeId));
    return visibleRows?.filter(({ typeId }) => selectedIds.has(typeId));
  }, [kind, selectedRows, visibleRows]);

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
            count={matchingIds?.size ?? filteredRows?.length}
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
            {kind === "data-type" ? (
              <TableHeaderToggle
                value={view === "Graph" ? "Graph" : dataTypeLayout}
                setValue={(mode: "Nested" | "Flat" | "Graph") => {
                  if (mode === "Graph") {
                    setView("Graph");
                  } else {
                    setDataTypeLayout(mode);
                    if (view !== "Table") {
                      setView("Table");
                    }
                  }
                }}
                options={[
                  {
                    icon: <FontAwesomeIcon icon={{ icon: faListTree }} />,
                    label: "Nested List",
                    value: "Nested",
                  },
                  {
                    icon: visualizerViewIcons.Table,
                    label: "Flat List",
                    value: "Flat",
                  },
                  {
                    icon: visualizerViewIcons.Graph,
                    label: "Graph view",
                    value: "Graph",
                  },
                ]}
              />
            ) : (
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
            )}
          </>
        }
        bottomLeft={
          selectedTypes && selectedTypes.length > 0 ? (
            <Stack direction="row" alignItems="center" gap={1}>
              <BulkActionsDropdown
                selectedItems={selectedTypes}
                onBulkActionCompleted={() => setSelectedRows([])}
              />
              {kind === "data-type" ? (
                <Button
                  size="small"
                  variant="tertiary_quiet"
                  onClick={() => setSelectedRows([])}
                >
                  Clear selection
                </Button>
              ) : null}
            </Stack>
          ) : (
            <TypesFilterRibbon
              leadingControls={
                <>
                  <SearchPill
                    title={
                      view === "Table"
                        ? hierarchical
                          ? "Search all data types, including collapsed groups"
                          : "Search for text in visible rows"
                        : "Search for a type in the graph"
                    }
                    onClick={() => {
                      if (view === "Table") {
                        setShowSearch(!showSearch);
                        onSearchValueChange("");
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
      {view === "Table" && tree?.isFlat ? (
        <Typography variant="smallTextParagraphs" sx={{ px: 2, py: 1 }}>
          Showing each matching type once because this hierarchy has too many
          branches to expand.
        </Typography>
      ) : null}
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
            gridRef={gridRef}
            columns={typesTableColumns}
            createGetCellContent={createGetCellContent}
            currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
            customRenderers={[
              createRenderTextIconCell({ firstColumnLeftPadding }),
              createRenderChipCell({ firstColumnLeftPadding }),
              renderDataTypeTreeCell,
            ]}
            dataLoading={
              !types ||
              loading ||
              (!onlyOneWeb &&
                allTypes === undefined &&
                filteredTypes.length === 0)
            }
            enableCheckboxSelection
            rowMarkerWidth={28}
            drawFocusRing={hierarchical}
            preserveCurrentCell={hierarchical}
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
            onSelectedRowsChange={onSelectedRowsChange}
            rows={visibleRows}
            searchValue={searchValue}
            onSearchValueChange={onSearchValueChange}
            onKeyDown={(event) => {
              const [column, index] = event.location ?? [-1, -1];
              const row = visibleRows?.[index];
              // Glide includes the checkbox column in keyboard event locations.
              if (
                column !== 1 ||
                !row?.hierarchy ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey
              ) {
                return;
              }
              if (event.key === " " && row.hierarchy.hasChildren) {
                event.cancel();
                event.preventDefault();
                toggleRow(row.rowId);
              } else if (event.key === "Enter") {
                event.cancel();
                event.preventDefault();
                pushToSlideStack({ kind: "dataType", itemId: row.typeId });
              }
            }}
            selectedRows={selectedVisibleRows}
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
          {tooltipElement}
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
      {dataTypeBeingEdited && (
        <DataTypeEditorDrawer
          mode="edit"
          dataType={dataTypeBeingEdited}
          onClose={() => setDataTypeBeingEdited(null)}
          onUpdated={() => setDataTypeBeingEdited(null)}
        />
      )}
    </Box>
  );
};
