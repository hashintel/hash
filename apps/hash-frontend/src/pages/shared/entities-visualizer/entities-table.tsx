import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type {
  CustomCell,
  Item,
  NumberCell,
  SizedGridColumn,
  TextCell,
} from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import {
  ArrowRightRegularIcon,
  IconButton,
  LoadingSpinner,
  Select,
} from "@hashintel/design-system";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { Box, Stack, useTheme } from "@mui/material";
import { useRouter } from "next/router";
import type {
  FunctionComponent,
  MutableRefObject,
  ReactElement,
  RefObject,
} from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { GridProps } from "../../../components/grid/grid";
import { Grid } from "../../../components/grid/grid";
import type { BlankCell } from "../../../components/grid/utils";
import { blankCell } from "../../../components/grid/utils";
import type { CustomIcon } from "../../../components/grid/utils/custom-grid-icons";
import type { ColumnFilter } from "../../../components/grid/utils/filtering";
import { tableContentSx } from "../../../shared/table-content";
import type { FilterState } from "../../../shared/table-header";
import { MenuItem } from "../../../shared/ui/menu-item";
import { isAiMachineActor } from "../../../shared/use-actors";
import type { ChipCellProps } from "../chip-cell";
import { createRenderChipCell } from "../chip-cell";
import type { UrlCellProps } from "../url-cell";
import { createRenderUrlCell } from "../url-cell";
import type { TextIconCell } from "./entities-table/text-icon-cell";
import { createRenderTextIconCell } from "./entities-table/text-icon-cell";
import { useEntitiesTable } from "./entities-table/use-entities-table";
import type {
  EntitiesTableData,
  TypeEntitiesRow,
} from "./entities-table/use-entities-table/types";
import type { EntitiesVisualizerData } from "./use-entities-visualizer-data";

const firstColumnLeftPadding = 16;

const emptyTableData: EntitiesTableData = {
  columns: [],
  rows: [],
  filterData: {
    createdByActors: [],
    lastEditedByActors: [],
    entityTypeTitles: [],
    noSourceCount: 0,
    noTargetCount: 0,
    sources: [],
    targets: [],
    webs: [],
  },
};

export const EntitiesTable: FunctionComponent<
  Pick<
    EntitiesVisualizerData,
    | "createdByIds"
    | "editionCreatedByIds"
    | "entities"
    | "entityTypes"
    | "propertyTypes"
    | "subgraph"
    | "typeIds"
    | "webIds"
  > & {
    currentlyDisplayedColumnsRef: MutableRefObject<SizedGridColumn[] | null>;
    currentlyDisplayedRowsRef: RefObject<TypeEntitiesRow[] | null>;
    disableTypeClick?: boolean;
    filterState: FilterState;
    handleEntityClick: (
      entityId: EntityId,
      modalContainerRef?: RefObject<HTMLDivElement | null>,
    ) => void;
    hasSomeLinks: boolean;
    hidePropertiesColumns?: boolean;
    hideColumns?: (keyof TypeEntitiesRow)[];
    limit: number;
    loading: boolean;
    loadingComponent: ReactElement;
    isViewingOnlyPages: boolean;
    maxHeight: string | number;
    goToNextPage?: () => void;
    readonly?: boolean;
    selectedRows: TypeEntitiesRow[];
    setLimit: (limit: number) => void;
    setSelectedRows: (rows: TypeEntitiesRow[]) => void;
    setSelectedEntityType: (params: { entityTypeId: VersionedUrl }) => void;
    setShowSearch: (showSearch: boolean) => void;
    showSearch: boolean;
  }
> = ({
  createdByIds,
  currentlyDisplayedColumnsRef,
  currentlyDisplayedRowsRef,
  disableTypeClick,
  editionCreatedByIds,
  entities,
  entityTypes,
  filterState,
  hasSomeLinks,
  handleEntityClick,
  hideColumns,
  hidePropertiesColumns = false,
  limit,
  loading: entityDataLoading,
  loadingComponent,
  isViewingOnlyPages,
  maxHeight,
  goToNextPage,
  propertyTypes,
  readonly,
  setLimit,
  selectedRows,
  setSelectedRows,
  showSearch,
  setShowSearch,
  setSelectedEntityType,
  subgraph,
  typeIds,
  webIds,
}) => {
  const router = useRouter();

  const { tableData, loading: tableDataCalculating } = useEntitiesTable({
    createdByIds,
    editionCreatedByIds,
    entities,
    entityTypes,
    propertyTypes,
    subgraph,
    hasSomeLinks,
    hideColumns,
    hideArchivedColumn: !filterState.includeArchived,
    hidePropertiesColumns,
    typeIds,
    webIds,
  });

  const {
    columns,
    rows,
    filterData: { createdByActors, lastEditedByActors, entityTypeTitles, webs },
  } = tableData ?? emptyTableData;

  // eslint-disable-next-line no-param-reassign
  currentlyDisplayedColumnsRef.current = columns;

  const theme = useTheme();

  const createGetCellContent = useCallback(
    (entityRows: TypeEntitiesRow[]) =>
      ([colIndex, rowIndex]: Item):
        | TextIconCell
        | TextCell
        | NumberCell
        | BlankCell
        | CustomCell => {
        const columnId = columns[colIndex]?.id;
        if (columnId) {
          const row = entityRows[rowIndex];

          if (!row) {
            /**
             * This can occur when `createGetCellContent` is called
             * for a row that has just been filtered out, so we handle
             * this by briefly not displaying anything in the cell.
             */
            return {
              kind: GridCellKind.Text,
              allowOverlay: false,
              readonly: true,
              displayData: String("Not Found"),
              data: "Not Found",
            };
          }

          if (columnId === "entityLabel") {
            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              copyData: row.entityLabel,
              cursor: "pointer",
              data: {
                kind: "chip-cell",
                chips: [
                  {
                    text: row.entityLabel,
                    icon: row.entityIcon
                      ? { entityTypeIcon: row.entityIcon }
                      : {
                          inbuiltIcon: row.sourceEntity
                            ? "bpLink"
                            : "bpAsterisk",
                        },
                    iconFill: theme.palette.gray[50],
                    onClick: () => {
                      if (isViewingOnlyPages) {
                        void router.push(
                          `/${row.web}/${extractEntityUuidFromEntityId(
                            row.entityId,
                          )}`,
                        );
                      } else {
                        handleEntityClick(row.entityId);
                      }
                    },
                  },
                ],
                color: "white",
                variant: "outlined",
              },
            };
          } else if (columnId === "entityTypes") {
            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              copyData: row.entityTypes.map((type) => type.title).join(", "),
              cursor: disableTypeClick ? "default" : "pointer",
              data: {
                kind: "chip-cell",
                chips: row.entityTypes.map((value) => ({
                  text: value.title,
                  icon: value.icon
                    ? { entityTypeIcon: value.icon }
                    : { inbuiltIcon: value.isLink ? "bpLink" : "bpAsterisk" },
                  iconFill: theme.palette.blue[70],
                  onClick: disableTypeClick
                    ? undefined
                    : () => {
                        setSelectedEntityType({
                          entityTypeId: value.entityTypeId,
                        });
                      },
                })),
                color: "white",
                variant: "outlined",
              } satisfies ChipCellProps,
            };
          } else if (columnId === "webId") {
            const shortname = row[columnId];

            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              cursor: "pointer",
              copyData: shortname,
              data: {
                kind: "text-icon-cell",
                icon: null,
                value: shortname,
                onClick: () => {
                  void router.push(`/${shortname}`);
                },
              },
            };
          } else if (
            columnId === "sourceEntity" ||
            columnId === "targetEntity"
          ) {
            const entity = row[columnId] as TypeEntitiesRow["sourceEntity"];
            if (!entity) {
              const data = "Does not apply";
              return {
                kind: GridCellKind.Text,
                allowOverlay: true,
                readonly: true,
                displayData: data,
                data,
                themeOverride: {
                  bgCell: theme.palette.gray[5],
                  textDark: theme.palette.gray[50],
                },
              };
            }

            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              copyData: entity.label,
              cursor: "pointer",
              data: {
                kind: "chip-cell",
                chips: [
                  {
                    icon: entity.icon
                      ? { entityTypeIcon: entity.icon }
                      : {
                          inbuiltIcon: entity.isLink ? "bpLink" : "bpAsterisk",
                        },
                    iconFill: theme.palette.gray[50],
                    text: entity.label,
                    onClick: () => {
                      handleEntityClick(entity.entityId);
                    },
                  },
                ],
                color: "white",
                variant: "outlined",
              },
            };
          }
          if (columnId === "archived") {
            const value = row.archived ? "Yes" : "No";
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(value),
              data: value,
            };
          } else if (columnId === "lastEdited") {
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(row.lastEdited),
              data: row.lastEdited,
            };
          } else if (columnId === "created") {
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(row.created),
              data: row.lastEdited,
            };
          } else if (columnId === "lastEditedBy" || columnId === "createdBy") {
            const actor =
              columnId === "lastEditedBy" ? row.lastEditedBy : row.createdBy;

            if (actor === "loading") {
              return {
                kind: GridCellKind.Text,
                readonly: true,
                allowOverlay: false,
                displayData: "Loading...",
                data: "Loading...",
              };
            }

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
              } satisfies ChipCellProps,
            };
          }

          const propertyCellValue = columnId && row[columnId];

          if (propertyCellValue) {
            let isUrl = false;
            try {
              const url = new URL(propertyCellValue as string);
              if (url.protocol === "http:" || url.protocol === "https:") {
                isUrl = true;
              }
            } catch {
              // not a URL
            }

            if (isUrl) {
              return {
                kind: GridCellKind.Custom,
                data: {
                  kind: "url-cell",
                  url: propertyCellValue as string,
                } satisfies UrlCellProps,
                copyData: String(propertyCellValue),
                allowOverlay: false,
                readonly: true,
              };
            }

            const isNumber = typeof propertyCellValue === "number";

            if (isNumber) {
              return {
                kind: GridCellKind.Number,
                allowOverlay: true,
                readonly: true,
                displayData: propertyCellValue.toString(),
                data: propertyCellValue,
              };
            }

            const stringValue = stringifyPropertyValue(propertyCellValue);

            return {
              kind: GridCellKind.Text,
              allowOverlay: true,
              readonly: true,
              displayData: stringValue,
              data: stringValue,
            };
          }

          const appliesToEntity = row.applicableProperties.includes(
            columnId as BaseUrl,
          );

          const data = appliesToEntity ? "–" : "Does not apply";

          return {
            kind: GridCellKind.Text,
            allowOverlay: true,
            readonly: true,
            displayData: data,
            data,
            themeOverride: appliesToEntity
              ? {
                  textDark: theme.palette.gray[50],
                }
              : {
                  bgCell: theme.palette.gray[5],
                  textDark: theme.palette.gray[50],
                },
          };
        }

        return blankCell;
      },
    [
      columns,
      disableTypeClick,
      handleEntityClick,
      router,
      isViewingOnlyPages,
      setSelectedEntityType,
      theme.palette,
    ],
  );

  const sortRows = useCallback<
    NonNullable<GridProps<TypeEntitiesRow>["sortRows"]>
  >((unsortedRows, sort, previousSort) => {
    return unsortedRows.toSorted((a, b) => {
      const value1 = a[sort.columnKey];
      const value2 = b[sort.columnKey];

      if (typeof value1 === "number" && typeof value2 === "number") {
        const difference =
          (value1 - value2) * (sort.direction === "asc" ? 1 : -1);
        return difference;
      }

      if (sort.columnKey === "entityTypes") {
        const entityType1 = a.entityTypes
          .map(({ title }) => title)
          .sort()
          .join(", ");
        const entityType2 = b.entityTypes
          .map(({ title }) => title)
          .sort()
          .join(", ");
        return (
          entityType1.localeCompare(entityType2) *
          (sort.direction === "asc" ? 1 : -1)
        );
      }

      const isActorSort = ["lastEditedBy", "createdBy"].includes(
        sort.columnKey,
      );

      const isEntitySort = ["sourceEntity", "targetEntity"].includes(
        sort.columnKey,
      );

      const stringValue1: string = isActorSort
        ? a[sort.columnKey].displayName
        : isEntitySort
          ? (a[sort.columnKey]?.label ?? "")
          : String(a[sort.columnKey]);

      const stringValue2: string = isActorSort
        ? b[sort.columnKey].displayName
        : isEntitySort
          ? (b[sort.columnKey]?.label ?? "")
          : String(b[sort.columnKey]);

      let comparison = stringValue1.localeCompare(stringValue2);

      if (comparison === 0) {
        const previousSortWasActorSort =
          previousSort &&
          ["lastEditedBy", "createdBy"].includes(previousSort.columnKey);

        const previousValue1: string = previousSort?.columnKey
          ? previousSortWasActorSort
            ? a[previousSort.columnKey].displayName
            : String(a[previousSort.columnKey])
          : undefined;

        const previousValue2: string = previousSort?.columnKey
          ? previousSortWasActorSort
            ? b[previousSort.columnKey].displayName
            : String(b[previousSort.columnKey])
          : undefined;

        if (previousValue1 && previousValue2) {
          // if the two keys are equal, we sort by the previous sort
          comparison = previousValue1.localeCompare(previousValue2);
        }
      }

      if (sort.direction === "desc") {
        // reverse if descending
        comparison = -comparison;
      }

      return comparison;
    });
  }, []);

  const [selectedEntityTypeTitles, setSelectedEntityTypeTitles] = useState<
    Set<string>
  >(new Set(Object.keys(entityTypeTitles)));

  useEffect(() => {
    setSelectedEntityTypeTitles(new Set(Object.keys(entityTypeTitles)));
  }, [entityTypeTitles]);

  const [selectedLastEditedByAccountIds, setSelectedLastEditedByAccountIds] =
    useState<Set<string>>(
      new Set(lastEditedByActors.map(({ accountId }) => accountId)),
    );

  const [selectedCreatedByAccountIds, setSelectedCreatedByAccountIds] =
    useState<Set<string>>(
      new Set(createdByActors.map(({ accountId }) => accountId)),
    );

  useEffect(() => {
    setSelectedLastEditedByAccountIds(
      new Set(lastEditedByActors.map(({ accountId }) => accountId)),
    );
  }, [lastEditedByActors]);

  useEffect(() => {
    setSelectedCreatedByAccountIds(
      new Set(createdByActors.map(({ accountId }) => accountId)),
    );
  }, [createdByActors]);

  const [selectedWebs, setSelectedWebs] = useState<Set<string>>(
    new Set(Object.keys(webs)),
  );

  useEffect(() => {
    setSelectedWebs(new Set(Object.keys(webs)));
  }, [webs]);

  const columnFilters = useMemo<ColumnFilter<string, TypeEntitiesRow>[]>(
    () => [
      {
        columnKey: "web",
        filterItems: webs.map(({ shortname, webId, count }) => ({
          id: webId,
          label: shortname,
          count,
        })),
        selectedFilterItemIds: selectedWebs,
        setSelectedFilterItemIds: setSelectedWebs,
        isRowFiltered: () => false,
      },
      {
        columnKey: "entityTypes",
        filterItems: entityTypeTitles.map(({ entityTypeId, count, title }) => ({
          id: entityTypeId,
          label: title,
          count,
        })),
        selectedFilterItemIds: selectedEntityTypeTitles,
        setSelectedFilterItemIds: setSelectedEntityTypeTitles,
        isRowFiltered: () => false,
      },
      {
        columnKey: "lastEditedBy",
        filterItems: lastEditedByActors.map((actor) => ({
          id: actor.accountId,
          label: actor.displayName ?? "Unknown Actor",
        })),
        selectedFilterItemIds: selectedLastEditedByAccountIds,
        setSelectedFilterItemIds: setSelectedLastEditedByAccountIds,
        isRowFiltered: () => false,
      },
      {
        columnKey: "createdBy",
        filterItems: createdByActors.map((actor) => ({
          id: actor.accountId,
          label: actor.displayName ?? "Unknown Actor",
        })),
        selectedFilterItemIds: selectedCreatedByAccountIds,
        setSelectedFilterItemIds: setSelectedCreatedByAccountIds,
        isRowFiltered: () => false,
      },
    ],
    [
      createdByActors,
      webs,
      selectedWebs,
      entityTypeTitles,
      selectedEntityTypeTitles,
      lastEditedByActors,
      selectedCreatedByAccountIds,
      selectedLastEditedByAccountIds,
    ],
  );

  if (!entities && (entityDataLoading || tableDataCalculating)) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={[
          {
            height: maxHeight,
            width: "100%",
          },
          tableContentSx,
        ]}
      >
        <Box>{loadingComponent}</Box>
      </Stack>
    );
  }

  return (
    <Stack gap={1}>
      <Grid
        showSearch={showSearch}
        onSearchClose={() => setShowSearch(false)}
        columns={columns}
        columnFilters={columnFilters}
        dataLoading={false}
        rows={rows}
        enableCheckboxSelection={!readonly}
        selectedRows={selectedRows}
        onSelectedRowsChange={(updatedSelectedRows) =>
          setSelectedRows(updatedSelectedRows)
        }
        sortRows={sortRows}
        firstColumnLeftPadding={firstColumnLeftPadding}
        height={`min(${maxHeight}, 600px)`}
        createGetCellContent={createGetCellContent}
        customRenderers={[
          createRenderTextIconCell({ firstColumnLeftPadding }),
          createRenderUrlCell({ firstColumnLeftPadding }),
          createRenderChipCell({ firstColumnLeftPadding }),
        ]}
        freezeColumns={1}
        currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
      />
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="flex-start"
          gap={2}
        >
          <Select
            value={limit.toString()}
            onChange={(event) => setLimit(parseInt(event.target.value, 10))}
            sx={{ width: 100 }}
          >
            <MenuItem value={10}>10</MenuItem>
            <MenuItem value={50}>50</MenuItem>
            <MenuItem value={100}>100</MenuItem>
            <MenuItem value={500}>500</MenuItem>
          </Select>
          {(entityDataLoading || tableDataCalculating) && (
            <LoadingSpinner size={28} color={theme.palette.blue[60]} />
          )}
        </Stack>
        <IconButton onClick={goToNextPage} disabled={!goToNextPage}>
          <ArrowRightRegularIcon />
        </IconButton>
      </Stack>
    </Stack>
  );
};
