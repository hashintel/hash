import { useQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type {
  CustomCell,
  Item,
  NumberCell,
  SizedGridColumn,
  TextCell,
} from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
// import {
//   ArrowRightRegularIcon,
//   IconButton,
//   LoadingSpinner,
//   Select,
// } from "@hashintel/design-system";
import type { EntityId } from "@local/hash-graph-types/entity";
import { isBaseUrl } from "@local/hash-graph-types/ontology";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { Box, Stack, useTheme } from "@mui/material";
import { useRouter } from "next/router";
import type {
  FunctionComponent,
  MutableRefObject,
  ReactElement,
  RefObject,
} from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ConversionTargetsByColumnKey,
  GridSort,
} from "../../../components/grid/grid";
import { Grid } from "../../../components/grid/grid";
import type { BlankCell } from "../../../components/grid/utils";
import { blankCell } from "../../../components/grid/utils";
import type { CustomIcon } from "../../../components/grid/utils/custom-grid-icons";
import type { ColumnFilter } from "../../../components/grid/utils/filtering";
import type {
  GetDataTypeConversionTargetsQuery,
  GetDataTypeConversionTargetsQueryVariables,
} from "../../../graphql/api-types.gen";
import { getDataTypeConversionTargetsQuery } from "../../../graphql/queries/ontology/data-type.queries";
import { tableContentSx } from "../../../shared/table-content";
import type { FilterState } from "../../../shared/table-header";
// import { MenuItem } from "../../../shared/ui/menu-item";
import { isAiMachineActor } from "../../../shared/use-actors";
import type { ChipCellProps } from "../chip-cell";
import { createRenderChipCell } from "../chip-cell";
import type { UrlCellProps } from "../url-cell";
import { createRenderUrlCell } from "../url-cell";
import type { TextIconCell } from "./entities-table/text-icon-cell";
import { createRenderTextIconCell } from "./entities-table/text-icon-cell";
import type {
  EntitiesTableColumnKey,
  EntitiesTableData,
  EntitiesTableRow,
  SortableEntitiesTableColumnKey,
} from "./entities-table/types";
import { useEntitiesTable } from "./entities-table/use-entities-table";
import type { EntitiesVisualizerData } from "./use-entities-visualizer-data";

const firstColumnLeftPadding = 16;

const emptyTableData: EntitiesTableData = {
  columns: [],
  rows: [],
  filterData: {
    createdByActors: [],
    lastEditedByActors: [],
    entityTypeFilters: [],
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
    | "typeTitles"
    | "webIds"
  > & {
    currentlyDisplayedColumnsRef: MutableRefObject<SizedGridColumn[] | null>;
    currentlyDisplayedRowsRef: RefObject<EntitiesTableRow[] | null>;
    disableTypeClick?: boolean;
    filterState: FilterState;
    handleEntityClick: (
      entityId: EntityId,
      modalContainerRef?: RefObject<HTMLDivElement | null>,
    ) => void;
    hasSomeLinks: boolean;
    hidePropertiesColumns?: boolean;
    hideColumns?: (keyof EntitiesTableRow)[];
    limit: number;
    loading: boolean;
    loadingComponent: ReactElement;
    isViewingOnlyPages: boolean;
    maxHeight: string | number;
    goToNextPage?: () => void;
    readonly?: boolean;
    selectedRows: EntitiesTableRow[];
    setLimit: (limit: number) => void;
    setLoading: (loading: boolean) => void;
    setSelectedRows: (rows: EntitiesTableRow[]) => void;
    setSelectedEntityType: (params: { entityTypeId: VersionedUrl }) => void;
    setShowSearch: (showSearch: boolean) => void;
    showSearch: boolean;
    sort: GridSort<SortableEntitiesTableColumnKey>;
    setSort: (sort: GridSort<SortableEntitiesTableColumnKey>) => void;
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
  limit: _limit,
  loading: entityDataLoading,
  loadingComponent,
  isViewingOnlyPages,
  maxHeight,
  goToNextPage: _goToNextPage,
  propertyTypes,
  readonly,
  setLimit: _setLimit,
  selectedRows,
  setLoading,
  setSelectedRows,
  showSearch,
  setShowSearch,
  setSelectedEntityType,
  setSort,
  sort,
  subgraph,
  typeIds,
  typeTitles,
  webIds,
}) => {
  const router = useRouter();

  const {
    visibleDataTypeIdsByPropertyBaseUrl,
    tableData,
    loading: tableDataCalculating,
  } = useEntitiesTable({
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
    typeTitles,
    webIds,
  });

  const visibleDataTypeIds = useMemo(() => {
    return Array.from(
      new Set(Object.values(visibleDataTypeIdsByPropertyBaseUrl).flat()),
    );
  }, [visibleDataTypeIdsByPropertyBaseUrl]);

  const { data: conversionTargetsData } = useQuery<
    GetDataTypeConversionTargetsQuery,
    GetDataTypeConversionTargetsQueryVariables
  >(getDataTypeConversionTargetsQuery, {
    fetchPolicy: "cache-first",
    variables: {
      dataTypeIds: visibleDataTypeIds,
    },
    skip: visibleDataTypeIds.length === 0,
  });

  console.log({ conversionTargetsData, visibleDataTypeIds });

  const conversionTargetsByColumnKey =
    useMemo<ConversionTargetsByColumnKey>(() => {
      const conversionMap = conversionTargetsData?.getDataTypeConversionTargets;

      if (!conversionMap) {
        return {};
      }

      const conversionData: ConversionTargetsByColumnKey = {};

      /**
       * For each property, we need to find the conversion targets which are valid across all of the possible data types.
       *
       * A conversion target which isn't present for one of the dataTypeIds cannot be included.
       */
      for (const [propertyBaseUrl, dataTypeIds] of typedEntries(
        visibleDataTypeIdsByPropertyBaseUrl,
      )) {
        const targetsByTargetTypeId: Record<
          VersionedUrl,
          { title: string; dataTypeId: VersionedUrl }[]
        > = {};

        for (const [index, sourceDataTypeId] of dataTypeIds.entries()) {
          const conversionsByTargetId = conversionMap[sourceDataTypeId];

          if (!conversionsByTargetId) {
            /**
             * We don't have any conversion targets for this dataTypeId, so there can't be any shared conversion targets across all of the data types.
             */
            continue;
          }

          for (const [targetTypeId, { title }] of typedEntries(
            conversionsByTargetId,
          )) {
            if (index === 0) {
              targetsByTargetTypeId[targetTypeId] ??= [];
              targetsByTargetTypeId[targetTypeId].push({
                dataTypeId: targetTypeId,
                title,
              });
            } else if (
              !targetsByTargetTypeId[targetTypeId] &&
              !dataTypeIds.includes(targetTypeId)
            ) {
              /**
               * If we haven't seen this target before, and we already have some targets, it is not a shared target.
               * If the target is in the source dataTypeIds, we retain it because we assume conversion is reciprocal.
               * This may not always hold.
               */
              continue;
            }
          }

          /**
           * Any target which is present from previous sources but not for this source is not a shared target.
           * We exempt this source dataTypeId from deletion because we assume conversion is reciprocal.
           * This may not always hold.
           */
          for (const existingTarget of typedKeys(targetsByTargetTypeId)) {
            if (
              !typedKeys(conversionsByTargetId).includes(existingTarget) &&
              existingTarget !== sourceDataTypeId
            ) {
              delete targetsByTargetTypeId[existingTarget];
            }
          }
        }
        conversionData[propertyBaseUrl] = Object.values(
          targetsByTargetTypeId,
        ).flat();
      }

      return conversionData;
    }, [
      conversionTargetsData?.getDataTypeConversionTargets,
      visibleDataTypeIdsByPropertyBaseUrl,
    ]);

  console.log({ conversionTargetsByColumnKey });

  useEffect(() => {
    setLoading(tableDataCalculating);
  }, [tableDataCalculating, setLoading]);

  const {
    columns,
    rows,
    filterData: {
      createdByActors,
      lastEditedByActors,
      entityTypeFilters,
      webs,
    },
  } = tableData ?? emptyTableData;

  // eslint-disable-next-line no-param-reassign
  currentlyDisplayedColumnsRef.current = columns;

  const theme = useTheme();

  const createGetCellContent = useCallback(
    (entityRows: EntitiesTableRow[]) =>
      ([colIndex, rowIndex]: Item):
        | TextIconCell
        | TextCell
        | NumberCell
        | BlankCell
        | CustomCell => {
        const columnId = columns[colIndex]?.id as EntitiesTableColumnKey;

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

          if (isBaseUrl(columnId)) {
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
                  copyData: stringifyPropertyValue(propertyCellValue),
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

            const appliesToEntity = row.applicableProperties.includes(columnId);

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
                  suffix: value.version ? `v${value.version}` : undefined,
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
          } else if (columnId === "web") {
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
            const entity = row[columnId] as EntitiesTableRow["sourceEntity"];
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
          } else {
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

  const [selectedEntityTypeIds, setSelectedEntityTypeIds] = useState<
    Set<string>
  >(new Set(entityTypeFilters.map(({ entityTypeId }) => entityTypeId)));

  useEffect(() => {
    setSelectedEntityTypeIds(
      new Set(entityTypeFilters.map(({ entityTypeId }) => entityTypeId)),
    );
  }, [entityTypeFilters]);

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
    new Set(webs.map(({ webId }) => webId)),
  );

  useEffect(() => {
    setSelectedWebs(new Set(webs.map(({ webId }) => webId)));
  }, [webs]);

  const columnFilters = useMemo<
    ColumnFilter<EntitiesTableColumnKey, EntitiesTableRow>[]
  >(
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
        isRowFiltered: (row) =>
          !selectedWebs.has(extractOwnedByIdFromEntityId(row.entityId)),
      },
      {
        columnKey: "entityTypes",
        filterItems: entityTypeFilters.map(
          ({ entityTypeId, count, title, version }) => ({
            id: entityTypeId,
            label: title,
            count,
            labelSuffix: version ? `v${version}` : undefined,
          }),
        ),
        selectedFilterItemIds: selectedEntityTypeIds,
        setSelectedFilterItemIds: setSelectedEntityTypeIds,
        isRowFiltered: (row) => {
          return !row.entityTypes.some(({ entityTypeId }) =>
            selectedEntityTypeIds.has(entityTypeId),
          );
        },
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
    ],
    [
      createdByActors,
      entityTypeFilters,
      lastEditedByActors,
      selectedEntityTypeIds,
      selectedCreatedByAccountIds,
      selectedLastEditedByAccountIds,
      selectedWebs,
      webs,
    ],
  );

  const sortableColumns: SortableEntitiesTableColumnKey[] = useMemo(() => {
    return [
      "archived",
      "created",
      "entityLabel",
      "entityTypes",
      "entityLabel",
      "lastEdited",
      ...columns.map((column) => column.id).filter((key) => isBaseUrl(key)),
    ];
  }, [columns]);

  if (!tableData && (entityDataLoading || tableDataCalculating)) {
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
        columnFilters={columnFilters}
        columns={columns}
        conversionTargetsByColumnKey={conversionTargetsByColumnKey}
        createGetCellContent={createGetCellContent}
        currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
        customRenderers={[
          createRenderTextIconCell({ firstColumnLeftPadding }),
          createRenderUrlCell({ firstColumnLeftPadding }),
          createRenderChipCell({ firstColumnLeftPadding }),
        ]}
        dataLoading={false}
        enableCheckboxSelection={!readonly}
        firstColumnLeftPadding={firstColumnLeftPadding}
        freezeColumns={1}
        height={`min(${maxHeight}, 600px)`}
        onConversionTargetSelected={console.log}
        onSearchClose={() => setShowSearch(false)}
        onSelectedRowsChange={(updatedSelectedRows) =>
          setSelectedRows(updatedSelectedRows)
        }
        rows={rows}
        selectedRows={selectedRows}
        showSearch={showSearch}
        sortableColumns={sortableColumns}
        sort={sort}
        setSort={setSort}
      />
      {/* @todo H-3255 Enable pagination when performance improvements are implemented */}

      {/*
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
      */}
    </Stack>
  );
};
