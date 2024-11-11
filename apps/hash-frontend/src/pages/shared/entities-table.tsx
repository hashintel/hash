import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import type {
  CustomCell,
  Item,
  NumberCell,
  SizedGridColumn,
  TextCell,
} from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import { gridRowHeight } from "@local/hash-isomorphic-utils/data-grid";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
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

import type { GridProps } from "../../components/grid/grid";
import {
  Grid,
  gridHeaderHeightWithBorder,
  gridHorizontalScrollbarHeight,
} from "../../components/grid/grid";
import type { BlankCell } from "../../components/grid/utils";
import { blankCell } from "../../components/grid/utils";
import type { CustomIcon } from "../../components/grid/utils/custom-grid-icons";
import type { ColumnFilter } from "../../components/grid/utils/filtering";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import type { FilterState } from "../../shared/table-header";
import { tableHeaderHeight } from "../../shared/table-header";
import { isAiMachineActor } from "../../shared/use-actors";
import type { ChipCellProps } from "./chip-cell";
import { createRenderChipCell } from "./chip-cell";
import type { TextIconCell } from "./entities-table/text-icon-cell";
import { createRenderTextIconCell } from "./entities-table/text-icon-cell";
import { useEntitiesTable } from "./entities-table/use-entities-table";
import type { TypeEntitiesRow } from "./entities-table/use-entities-table/types";
import { TOP_CONTEXT_BAR_HEIGHT } from "./top-context-bar";
import type { UrlCellProps } from "./url-cell";
import { createRenderUrlCell } from "./url-cell";
import { tableContentSx } from "../../shared/table-content";

const noneString = "none";

const firstColumnLeftPadding = 16;

const emptyTableData = {
  columns: [],
  rows: [],
  filterData: {
    createdByActors: [],
    lastEditedByActors: [],
    entityTypeTitles: {},
    noSourceCount: 0,
    noTargetCount: 0,
    sources: [],
    targets: [],
    webs: {},
  },
};

export const EntitiesTable: FunctionComponent<{
  currentlyDisplayedColumnsRef: MutableRefObject<SizedGridColumn[] | null>;
  currentlyDisplayedRowsRef: RefObject<TypeEntitiesRow[]>;
  disableTypeClick?: boolean;
  entities: Entity[];
  entityTypes: EntityType[];
  filterState: FilterState;
  handleEntityClick: (
    entityId: EntityId,
    modalContainerRef?: RefObject<HTMLDivElement>,
  ) => void;
  hasSomeLinks: boolean;
  hidePropertiesColumns?: boolean;
  hideColumns?: (keyof TypeEntitiesRow)[];
  loading: boolean;
  loadingComponent: ReactElement;
  isViewingOnlyPages: boolean;
  maxHeight?: string | number;
  propertyTypes: PropertyType[];
  readonly?: boolean;
  selectedRows: TypeEntitiesRow[];
  setSelectedRows: (rows: TypeEntitiesRow[]) => void;
  setSelectedEntityType: (params: { entityTypeId: VersionedUrl }) => void;
  setShowSearch: (showSearch: boolean) => void;
  showSearch: boolean;
  subgraph: Subgraph<EntityRootType>;
}> = ({
  currentlyDisplayedColumnsRef,
  currentlyDisplayedRowsRef,
  disableTypeClick,
  entities,
  entityTypes,
  filterState,
  hasSomeLinks,
  handleEntityClick,
  hideColumns,
  hidePropertiesColumns = false,
  loading: entityDataLoading,
  loadingComponent,
  isViewingOnlyPages,
  maxHeight,
  propertyTypes,
  readonly,
  selectedRows,
  setSelectedRows,
  showSearch,
  setShowSearch,
  setSelectedEntityType,
  subgraph,
}) => {
  const router = useRouter();

  const { tableData, loading: tableDataCalculating } = useEntitiesTable({
    entities,
    entityTypes,
    propertyTypes,
    subgraph,
    hasSomeLinks,
    hideColumns,
    hidePageArchivedColumn: !filterState.includeArchived,
    hidePropertiesColumns,
    isViewingOnlyPages,
  });

  const {
    columns,
    rows,
    filterData: {
      createdByActors,
      lastEditedByActors,
      entityTypeTitles,
      noSourceCount,
      noTargetCount,
      sources,
      targets,
      webs,
    },
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

  const [selectedArchivedStatus, setSelectedArchivedStatus] = useState<
    Set<"archived" | "not-archived">
  >(new Set(["archived", "not-archived"]));

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

  const [selectedSourceEntities, setSelectedSourceEntities] = useState(() => {
    const selectedSources = new Set(sources.map(({ entityId }) => entityId));
    if (noSourceCount) {
      selectedSources.add(noneString);
    }
    return selectedSources;
  });

  useEffect(() => {
    const selectedSources = new Set(sources.map(({ entityId }) => entityId));
    if (noSourceCount) {
      selectedSources.add(noneString);
    }
    setSelectedSourceEntities(selectedSources);
  }, [sources, noSourceCount]);

  const [selectedTargetEntities, setSelectedTargetEntities] = useState(() => {
    const selectedTargets = new Set(targets.map(({ entityId }) => entityId));
    if (noTargetCount) {
      selectedTargets.add(noneString);
    }
    return selectedTargets;
  });

  useEffect(() => {
    const selectedTargets = new Set(targets.map(({ entityId }) => entityId));
    if (noTargetCount) {
      selectedTargets.add(noneString);
    }
    setSelectedTargetEntities(selectedTargets);
  }, [targets, noTargetCount]);

  const columnFilters = useMemo<ColumnFilter<string, TypeEntitiesRow>[]>(
    () => [
      {
        columnKey: "web",
        filterItems: Object.entries(webs).map(([web, count]) => ({
          id: web,
          label: web,
          count,
        })),
        selectedFilterItemIds: selectedWebs,
        setSelectedFilterItemIds: setSelectedWebs,
        isRowFiltered: (row) => !selectedWebs.has(row.web),
      },
      {
        columnKey: "entityTypes",
        filterItems: Object.entries(entityTypeTitles).map(
          ([entityTypeTitle, count]) => ({
            id: entityTypeTitle,
            label: entityTypeTitle,
            count,
          }),
        ),
        selectedFilterItemIds: selectedEntityTypeTitles,
        setSelectedFilterItemIds: setSelectedEntityTypeTitles,
        isRowFiltered: (row) => {
          return !row.entityTypes.some(({ title }) =>
            selectedEntityTypeTitles.has(title),
          );
        },
      },
      {
        columnKey: "archived",
        filterItems: [
          {
            id: "archived",
            label: "Archived",
          },
          {
            id: "not-archived",
            label: "Not Archived",
          },
        ],
        selectedFilterItemIds: selectedArchivedStatus,
        setSelectedFilterItemIds: (filterItemIds) =>
          setSelectedArchivedStatus(
            new Set(filterItemIds as Set<"archived" | "not-archived">),
          ),
        isRowFiltered: (row) =>
          row.archived
            ? !selectedArchivedStatus.has("archived")
            : !selectedArchivedStatus.has("not-archived"),
      },
      {
        columnKey: "lastEditedBy",
        filterItems: lastEditedByActors.map((actor) => ({
          id: actor.accountId,
          label: actor.displayName ?? "Unknown Actor",
        })),
        selectedFilterItemIds: selectedLastEditedByAccountIds,
        setSelectedFilterItemIds: setSelectedLastEditedByAccountIds,
        isRowFiltered: (row) =>
          row.lastEditedBy && row.lastEditedBy !== "loading"
            ? !selectedLastEditedByAccountIds.has(row.lastEditedBy.accountId)
            : false,
      },
      {
        columnKey: "createdBy",
        filterItems: createdByActors.map((actor) => ({
          id: actor.accountId,
          label: actor.displayName ?? "Unknown Actor",
        })),
        selectedFilterItemIds: selectedCreatedByAccountIds,
        setSelectedFilterItemIds: setSelectedCreatedByAccountIds,
        isRowFiltered: (row) =>
          row.createdBy && row.createdBy !== "loading"
            ? !selectedCreatedByAccountIds.has(row.createdBy.accountId)
            : false,
      },
      {
        columnKey: "sourceEntity",
        filterItems: (() => {
          const items: ColumnFilter<string, TypeEntitiesRow>["filterItems"] =
            [];
          if (noSourceCount) {
            items.push({
              id: noneString,
              doesNotApplyValue: true,
              label: "Does not apply",
              count: noSourceCount,
            });
          }
          items.push(
            ...sources.map((source) => ({
              id: source.entityId,
              label: source.label,
              count: source.count,
            })),
          );

          return items;
        })(),
        selectedFilterItemIds: selectedSourceEntities,
        setSelectedFilterItemIds: setSelectedSourceEntities,
        isRowFiltered: (row) =>
          row.sourceEntity
            ? !selectedSourceEntities.has(row.sourceEntity.entityId)
            : !selectedSourceEntities.has(noneString),
      },
      {
        columnKey: "targetEntity",
        filterItems: (() => {
          const items: ColumnFilter<string, TypeEntitiesRow>["filterItems"] =
            [];
          if (noTargetCount) {
            items.push({
              id: noneString,
              doesNotApplyValue: true,
              label: "Does not apply",
              count: noTargetCount,
            });
          }
          items.push(
            ...targets.map((target) => ({
              id: target.entityId,
              label: target.label,
              count: target.count,
            })),
          );

          return items;
        })(),
        selectedFilterItemIds: selectedTargetEntities,
        setSelectedFilterItemIds: setSelectedTargetEntities,
        isRowFiltered: (row) =>
          row.targetEntity
            ? !selectedTargetEntities.has(row.targetEntity.entityId)
            : !selectedTargetEntities.has(noneString),
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
      selectedArchivedStatus,
      selectedSourceEntities,
      selectedTargetEntities,
      noSourceCount,
      noTargetCount,
      sources,
      targets,
    ],
  );

  const maximumTableHeight =
    maxHeight ??
    `calc(100vh - (${
      HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 185 + tableHeaderHeight
    }px + ${theme.spacing(5)} + ${theme.spacing(5)}))`;

  if (entityDataLoading || tableDataCalculating) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={[
          {
            height: maximumTableHeight,
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
      height={`
               min(
                 ${maximumTableHeight},
                calc(
                 ${gridHeaderHeightWithBorder}px +
                 (${rows.length ? rows.length : 1} * ${gridRowHeight}px) +
                 ${gridHorizontalScrollbarHeight}px)
               )`}
      createGetCellContent={createGetCellContent}
      customRenderers={[
        createRenderTextIconCell({ firstColumnLeftPadding }),
        createRenderUrlCell({ firstColumnLeftPadding }),
        createRenderChipCell({ firstColumnLeftPadding }),
      ]}
      freezeColumns={1}
      currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
    />
  );
};
