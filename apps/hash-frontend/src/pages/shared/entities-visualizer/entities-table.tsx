import { useQuery } from "@apollo/client";
import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
  isBaseUrl,
} from "@blockprotocol/type-system";
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
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import type { ClosedMultiEntityTypesRootMap } from "@local/hash-graph-sdk/ontology";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { Box, Stack, useTheme } from "@mui/material";
import { useRouter } from "next/router";
import type {
  Dispatch,
  FunctionComponent,
  MutableRefObject,
  ReactElement,
  RefObject,
  SetStateAction,
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
import { MenuItem } from "../../../shared/ui/menu-item";
// import { MenuItem } from "../../../shared/ui/menu-item";
import { isAiMachineActor } from "../../../shared/use-actors";
import { useMemoCompare } from "../../../shared/use-memo-compare";
import type { ChipCellProps } from "../chip-cell";
import { createRenderChipCell } from "../chip-cell";
import type { UrlCellProps } from "../url-cell";
import { createRenderUrlCell } from "../url-cell";
import {
  createRenderEntitiesTableValueCell,
  type EntitiesTableValueCellProps,
} from "./entities-table/entities-table-value-cell";
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
    | "definitions"
    | "editionCreatedByIds"
    | "entities"
    | "subgraph"
    | "typeIds"
    | "typeTitles"
    | "webIds"
  > & {
    activeConversions: {
      [columnBaseUrl: BaseUrl]: {
        dataTypeId: VersionedUrl;
        title: string;
      };
    } | null;
    closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap;
    currentlyDisplayedColumnsRef: MutableRefObject<SizedGridColumn[] | null>;
    currentlyDisplayedRowsRef: RefObject<EntitiesTableRow[] | null>;
    disableTypeClick?: boolean;
    filterState: FilterState;
    handleEntityClick: (entityId: EntityId) => void;
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
    setActiveConversions: Dispatch<
      SetStateAction<{
        [columnBaseUrl: BaseUrl]: VersionedUrl;
      } | null>
    >;
    setLimit: (limit: number) => void;
    setLoading: (loading: boolean) => void;
    setSelectedRows: (rows: EntitiesTableRow[]) => void;
    setSelectedEntityType: (params: { entityTypeId: VersionedUrl }) => void;
    setShowSearch: (showSearch: boolean) => void;
    showSearch: boolean;
    sort: GridSort<SortableEntitiesTableColumnKey>;
    setSort: (
      sort: GridSort<SortableEntitiesTableColumnKey> & {
        convertTo?: BaseUrl;
      },
    ) => void;
  }
> = ({
  activeConversions,
  closedMultiEntityTypesRootMap,
  createdByIds,
  currentlyDisplayedColumnsRef,
  currentlyDisplayedRowsRef,
  definitions,
  disableTypeClick,
  editionCreatedByIds,
  entities,
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
  readonly,
  setLimit,
  selectedRows,
  setActiveConversions,
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
    visibleDataTypesByPropertyBaseUrl,
    tableData,
    loading: tableDataCalculating,
  } = useEntitiesTable({
    closedMultiEntityTypesRootMap,
    createdByIds,
    definitions,
    editionCreatedByIds,
    entities,
    hasSomeLinks,
    hideColumns,
    hideArchivedColumn: !filterState.includeArchived,
    hidePropertiesColumns,
    subgraph,
    typeIds,
    typeTitles,
    webIds,
  });

  const visibleDataTypeIds = useMemoCompare(
    () => {
      return Array.from(
        new Set(
          Object.values(visibleDataTypesByPropertyBaseUrl).flatMap((types) =>
            types.map((type) => type.schema.$id),
          ),
        ),
      );
    },
    [visibleDataTypesByPropertyBaseUrl],
    (oldValue, newValue) => {
      const oldSet = new Set(oldValue);
      const newSet = new Set(newValue);
      return oldSet.size === newSet.size && oldSet.isSubsetOf(newSet);
    },
  );

  /**
   * Although this is derived from the query data return, we don't want to do it in a useMemo because the data becomes undefined temporarily.
   * useQuery has a `previousData` property which we could fall back to, but there's a brief moment where going from a converted column
   * to a non-converted column will mean the conversion targets are out of sync with the entity data.
   * We rely on knowing that a column has conversion targets in order to show the conversion button, and don't want it to flicker on and off.
   *
   * @todo H-3939 we can simplify a lot of this logic when the Graph API doesn't error if not all rows can be converted to a desired target.
   */
  const [conversionTargetsByColumnKey, setConversionTargetsByColumnKey] =
    useState<ConversionTargetsByColumnKey>({});

  useQuery<
    GetDataTypeConversionTargetsQuery,
    GetDataTypeConversionTargetsQueryVariables
  >(getDataTypeConversionTargetsQuery, {
    fetchPolicy: "cache-first",
    variables: {
      dataTypeIds: visibleDataTypeIds,
    },
    skip: visibleDataTypeIds.length === 0,
    onCompleted: (data) => {
      const conversionMap = data.getDataTypeConversionTargets;

      const conversionData: ConversionTargetsByColumnKey = {};

      /**
       * For each property, we need to find the conversion targets which are valid across all of the possible data types.
       *
       * A conversion target which isn't present for one of the dataTypeIds cannot be included.
       */
      for (const [propertyBaseUrl, dataTypes] of typedEntries(
        visibleDataTypesByPropertyBaseUrl,
      )) {
        const targetsByTargetTypeId: Record<
          VersionedUrl,
          {
            title: string;
            dataTypeId: VersionedUrl;
            guessedAsCanonical?: boolean;
          }[]
        > = {};

        for (const [index, sourceDataType] of dataTypes.entries()) {
          const sourceDataTypeId = sourceDataType.schema.$id;

          const conversionsByTargetId = conversionMap[sourceDataTypeId];

          if (!conversionsByTargetId) {
            /**
             * We don't have any conversion targets for this dataTypeId, so there can't be any shared conversion targets across all of the data types.
             */
            continue;
          }

          for (const [targetTypeId, { title, conversions }] of typedEntries(
            conversionsByTargetId,
          )) {
            if (index === 0) {
              targetsByTargetTypeId[targetTypeId] ??= [];
              targetsByTargetTypeId[targetTypeId].push({
                dataTypeId: targetTypeId,
                title,
                guessedAsCanonical: conversions.length === 1,
              });
            } else if (
              !targetsByTargetTypeId[targetTypeId] &&
              !dataTypes.some(
                (dataType) => dataType.schema.$id === targetTypeId,
              )
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

        setConversionTargetsByColumnKey(conversionData);
      }
    },
  });

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
        const columnId = columns[colIndex]?.id;

        if (columnId) {
          const row = entityRows[rowIndex];

          if (!row || !definitions?.dataTypes) {
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
            const propertyCell = columnId && row[columnId];

            if (propertyCell) {
              const { isArray, value, propertyMetadata } = propertyCell;

              let isUrl = false;
              try {
                const url = new URL(value as string);
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
                    url: value as string,
                  } satisfies UrlCellProps,
                  copyData: stringifyPropertyValue(value),
                  allowOverlay: false,
                  readonly: true,
                };
              }

              return {
                kind: GridCellKind.Custom,
                allowOverlay: true,
                readonly: true,
                copyData: stringifyPropertyValue(value),
                data: {
                  kind: "entities-table-value-cell",
                  isArray,
                  value,
                  propertyMetadata,
                  dataTypeDefinitions: definitions.dataTypes,
                } satisfies EntitiesTableValueCellProps,
              };
            }

            const appliesToEntity = row.applicableProperties.includes(columnId);

            const data = appliesToEntity ? "–" : "Does not apply";

            return {
              kind: GridCellKind.Text,
              allowOverlay: false,
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
                  suffix: value.version
                    ? `v${value.version.toString()}`
                    : undefined,
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
      definitions?.dataTypes,
      disableTypeClick,
      handleEntityClick,
      isViewingOnlyPages,
      router,
      setSelectedEntityType,
      theme.palette.blue,
      theme.palette.gray,
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
      new Set(lastEditedByActors.map(({ actorId }) => actorId)),
    );

  const [selectedCreatedByAccountIds, setSelectedCreatedByAccountIds] =
    useState<Set<string>>(
      new Set(createdByActors.map(({ actorId }) => actorId)),
    );

  useEffect(() => {
    setSelectedLastEditedByAccountIds(
      new Set(lastEditedByActors.map(({ actorId }) => actorId)),
    );
  }, [lastEditedByActors]);

  useEffect(() => {
    setSelectedCreatedByAccountIds(
      new Set(createdByActors.map(({ actorId }) => actorId)),
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
          !selectedWebs.has(extractWebIdFromEntityId(row.entityId)),
      },
      {
        columnKey: "entityTypes",
        filterItems: entityTypeFilters.map(
          ({ entityTypeId, count, title, version }) => ({
            id: entityTypeId,
            label: title,
            count,
            labelSuffix: version ? `v${version.toString()}` : undefined,
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
          id: actor.actorId,
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
          id: actor.actorId,
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

  const onConversionTargetSelected = useCallback(
    ({
      columnKey,
      dataTypeId,
    }: { columnKey: BaseUrl; dataTypeId: VersionedUrl | null }) => {
      if (!dataTypeId) {
        if (!activeConversions) {
          return;
        }

        const newConversions: Parameters<typeof setActiveConversions>[0] = {};
        let hasKeysRemaining = false;

        for (const [key, value] of typedEntries(activeConversions)) {
          if (key !== columnKey) {
            newConversions[key] = value.dataTypeId;
            hasKeysRemaining = true;
          }
        }

        if (!hasKeysRemaining) {
          setActiveConversions(null);
        } else {
          setActiveConversions(newConversions);
        }
      } else {
        setActiveConversions((existingConversions) => ({
          ...existingConversions,
          [columnKey]: dataTypeId,
        }));
      }
    },
    [activeConversions, setActiveConversions],
  );

  const customRenderers = useMemo(() => {
    return [
      createRenderTextIconCell({ firstColumnLeftPadding }),
      createRenderUrlCell({ firstColumnLeftPadding }),
      createRenderChipCell({ firstColumnLeftPadding }),
      createRenderEntitiesTableValueCell({ firstColumnLeftPadding }),
    ];
  }, []);

  const setSortWithConversion = useCallback(
    (newSort: GridSort<SortableEntitiesTableColumnKey>) => {
      const targetConversions = conversionTargetsByColumnKey[newSort.columnKey];

      const canonical = targetConversions?.find(
        (conversion) => conversion.guessedAsCanonical,
      );

      if (canonical) {
        setSort({
          ...newSort,
          convertTo: extractBaseUrl(canonical.dataTypeId),
        });
      } else {
        setSort(newSort);
      }
    },
    [conversionTargetsByColumnKey, setSort],
  );

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
        activeConversions={activeConversions}
        columnFilters={columnFilters}
        columns={columns}
        conversionTargetsByColumnKey={conversionTargetsByColumnKey}
        createGetCellContent={createGetCellContent}
        currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
        customRenderers={customRenderers}
        dataLoading={false}
        enableCheckboxSelection={!readonly}
        firstColumnLeftPadding={firstColumnLeftPadding}
        freezeColumns={1}
        height={`min(${maxHeight}, 600px)`}
        onConversionTargetSelected={onConversionTargetSelected}
        onSearchClose={() => setShowSearch(false)}
        onSelectedRowsChange={(updatedSelectedRows) =>
          setSelectedRows(updatedSelectedRows)
        }
        rows={rows}
        selectedRows={selectedRows}
        showSearch={showSearch}
        sortableColumns={sortableColumns}
        sort={sort}
        setSort={setSortWithConversion}
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
