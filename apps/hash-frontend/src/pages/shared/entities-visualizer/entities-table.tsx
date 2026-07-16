import { useQuery } from "@apollo/client";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { Box, Stack, useTheme } from "@mui/material";
import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  extractEntityUuidFromEntityId,
  isBaseUrl,
} from "@blockprotocol/type-system";
import { ArrowDownRegularIcon, LoadingSpinner } from "@hashintel/design-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";

import { Grid } from "../../../components/grid/grid";
import { useGetOwnerForEntity } from "../../../components/hooks/use-get-owner-for-entity";
import { findDataTypeConversionTargetsQuery } from "../../../graphql/queries/ontology/data-type.queries";
import { generateCsvFile as buildCsvFile } from "../../../shared/table-header/generate-csv-file";
import { Button } from "../../../shared/ui/button";
import {
  isAiMachineActor,
  type MinimalActor,
  useActors,
} from "../../../shared/use-actors";
import { useMemoCompare } from "../../../shared/use-memo-compare";
import { createRenderChipCell } from "../chip-cell";
import { getReferencedDataTypeIds } from "../format-value";
import { createRenderTextIconCell } from "../text-icon-cell";
import { createRenderUrlCell } from "../url-cell";
import {
  createRenderEntitiesTableValueCell,
  type EntitiesTableValueCellProps,
} from "./entities-table/entities-table-value-cell";
import { TableToolbar } from "./entities-table/table-toolbar";

import type {
  ConversionTargetsByColumnKey,
  GridSort,
} from "../../../components/grid/grid";
import type { BlankCell } from "../../../components/grid/utils";
import type { CustomIcon } from "../../../components/grid/utils/custom-grid-icons";
import type {
  FindDataTypeConversionTargetsQuery,
  FindDataTypeConversionTargetsQueryVariables,
} from "../../../graphql/api-types.gen";
import type { GenerateCsvFileFunction } from "../../../shared/table-header/export-to-csv-button";
import type { ChipCellProps } from "../chip-cell";
import type { TextIconCell } from "../text-icon-cell";
import type { UrlCellProps } from "../url-cell";
import type {
  EntitiesTableData,
  EntitiesTableRow,
  SortableEntitiesTableColumnKey,
} from "./entities-table-data";
import type { EntitiesVisualizerData } from "./use-entities-visualizer-data";
import type {
  ActorEntityUuid,
  BaseUrl,
  EntityId,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type {
  CustomCell,
  Item,
  NumberCell,
  SizedGridColumn,
  TextCell,
} from "@glideapps/glide-data-grid";
import type {
  Dispatch,
  FunctionComponent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";

export { toolbarHeight } from "./entities-table/table-toolbar";

const firstColumnLeftPadding = 16;

const sortableColumns: SortableEntitiesTableColumnKey[] = [
  "archived",
  "created",
  "entityLabel",
  "entityTypes",
  "lastEdited",
];

const emptyTableData: EntitiesTableData = {
  columns: [],
  dataTypeDefinitions: {},
  rows: [],
  entityTypesWithMultipleVersionsPresent: new Set(),
  visibleDataTypeIdsByPropertyBaseUrl: {},
};

export const EntitiesTable: FunctionComponent<
  Pick<EntitiesVisualizerData, "subgraph"> & {
    activeConversions: {
      [columnBaseUrl: BaseUrl]: {
        dataTypeId: VersionedUrl;
        title: string;
      };
    } | null;
    csvFileTitle: string;
    currentlyDisplayedColumnsRef: MutableRefObject<SizedGridColumn[] | null>;
    currentlyDisplayedRowsRef: RefObject<EntitiesTableRow[] | null>;
    disableTypeClick?: boolean;
    handleEntityClick: (entityId: EntityId) => void;
    loading: boolean;
    isViewingOnlyPages: boolean;
    maxHeight: string | number;
    hasMoreRowsAvailable: boolean;
    loadMoreRows?: () => void;
    selectedRows: EntitiesTableRow[];
    setActiveConversions: Dispatch<
      SetStateAction<{
        [columnBaseUrl: BaseUrl]: VersionedUrl;
      } | null>
    >;
    setSelectedRows: (rows: EntitiesTableRow[]) => void;
    setSelectedEntityType: (params: { entityTypeId: VersionedUrl }) => void;
    setShowSearch: (showSearch: boolean) => void;
    showSearch: boolean;
    sort: GridSort<SortableEntitiesTableColumnKey>;
    setSort: (sort: GridSort<SortableEntitiesTableColumnKey>) => void;
    tableData: EntitiesTableData | null;
    totalResultCount: number | null;
  }
> = ({
  activeConversions,
  csvFileTitle,
  currentlyDisplayedColumnsRef,
  currentlyDisplayedRowsRef,
  disableTypeClick,
  handleEntityClick,
  loading: entityDataLoading,
  isViewingOnlyPages,
  maxHeight,
  hasMoreRowsAvailable,
  loadMoreRows,
  selectedRows,
  setActiveConversions,
  setSelectedRows,
  showSearch,
  setShowSearch,
  setSelectedEntityType,
  setSort,
  sort,
  tableData,
  totalResultCount,
}) => {
  const router = useRouter();

  const getOwnerForEntity = useGetOwnerForEntity();

  const {
    columns,
    dataTypeDefinitions,
    entityTypesWithMultipleVersionsPresent,
    rows,
    visibleDataTypeIdsByPropertyBaseUrl,
  } = tableData ?? emptyTableData;

  const editorActorIds = useMemo(() => {
    const editorIds = new Set<ActorEntityUuid>();
    for (const row of rows) {
      editorIds.add(row.lastEditedById);
      editorIds.add(row.createdById);
    }
    return [...editorIds];
  }, [rows]);

  const { actors } = useActors({
    accountIds: editorActorIds,
  });

  const actorsByAccountId: Record<ActorEntityUuid, MinimalActor | null> =
    useMemo(() => {
      if (!actors) {
        return {};
      }

      const actorsByAccount: Record<ActorEntityUuid, MinimalActor | null> = {};

      for (const actor of actors) {
        actorsByAccount[actor.accountId] = actor;
      }

      return actorsByAccount;
    }, [actors]);

  const webNameByWebId = useMemo(() => {
    if (!rows.length) {
      return {};
    }

    const webNameByOwner: Record<WebId, string> = {};

    const webIds = rows.map((row) => row.webId);
    for (const webId of webIds) {
      const owner = getOwnerForEntity({ webId });
      webNameByOwner[webId] = owner.shortname;
    }

    return webNameByOwner;
  }, [getOwnerForEntity, rows]);

  const visibleDataTypeIds = useMemoCompare(
    () => {
      return Array.from(
        new Set(
          Object.values(visibleDataTypeIdsByPropertyBaseUrl).flatMap((types) =>
            [...types].map((type) => type.schema.$id),
          ),
        ),
      );
    },
    [visibleDataTypeIdsByPropertyBaseUrl],
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
    FindDataTypeConversionTargetsQuery,
    FindDataTypeConversionTargetsQueryVariables
  >(findDataTypeConversionTargetsQuery, {
    fetchPolicy: "cache-first",
    variables: {
      dataTypeIds: visibleDataTypeIds,
    },
    skip: visibleDataTypeIds.length === 0,
    onCompleted: (data) => {
      const conversionMap = data.findDataTypeConversionTargets;

      const conversionData: ConversionTargetsByColumnKey = {};

      /**
       * For each property, we need to find the conversion targets which are valid across all of the possible data types.
       *
       * A conversion target which isn't present for one of the dataTypeIds cannot be included.
       */
      for (const [propertyBaseUrl, [...dataTypes]] of typedEntries(
        visibleDataTypeIdsByPropertyBaseUrl,
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

        const blankCell: TextCell = {
          kind: GridCellKind.Text,
          allowOverlay: false,
          readonly: true,
          displayData: "",
          data: "",
        };

        if (columnId) {
          const row = entityRows[rowIndex];

          if (!row) {
            /**
             * This can occur when `createGetCellContent` is called
             * for a row that has just been filtered out, so we handle
             * this by briefly not displaying anything in the cell.
             */
            return blankCell;
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

              /**
               * Belt-and-braces against `formatValue` throwing: if any data
               * type the value depends on is missing from the pool, render the
               * fallback rather than crashing the whole grid. With the pool now
               * bundled into `tableData` this should not happen in normal flow,
               * but it still guards against a genuinely inconsistent response.
               */
              const unresolvedDataTypeId = getReferencedDataTypeIds(
                propertyMetadata,
              ).find((dataTypeId) => !dataTypeDefinitions[dataTypeId]);

              if (unresolvedDataTypeId) {
                Sentry.captureException(
                  new Error(
                    `Data type not found for ${unresolvedDataTypeId} when rendering value`,
                  ),
                );
                return blankCell;
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
                  dataTypeDefinitions,
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
                          `/${row.webId}/${extractEntityUuidFromEntityId(
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
                  suffix: entityTypesWithMultipleVersionsPresent.has(
                    value.entityTypeId,
                  )
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
          } else if (columnId === "webId") {
            const shortname = webNameByWebId[row.webId];

            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              cursor: "pointer",
              copyData: shortname ?? "",
              data: {
                kind: "text-icon-cell",
                icon: null,
                value: `@${shortname}`,
                onClick: shortname
                  ? () => {
                      void router.push(`/@${shortname}`);
                    }
                  : undefined,
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
            const actorId =
              columnId === "lastEditedById"
                ? row.lastEditedById
                : row.createdById;

            const actor = actorsByAccountId[actorId];

            if (!actor) {
              return {
                kind: GridCellKind.Text,
                readonly: true,
                allowOverlay: false,
                displayData: "Loading...",
                data: "Loading...",
              };
            }

            const actorIcon =
              actor.kind === "machine"
                ? isAiMachineActor(actor)
                  ? "wandMagicSparklesRegular"
                  : "hashSolid"
                : ("userRegular" satisfies CustomIcon);

            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: false,
              copyData: String(actor.displayName),
              data: {
                kind: "chip-cell",
                chips: actor.displayName
                  ? [
                      {
                        text: actor.displayName,
                        icon: { inbuiltIcon: actorIcon },
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
      actorsByAccountId,
      columns,
      dataTypeDefinitions,
      disableTypeClick,
      entityTypesWithMultipleVersionsPresent,
      handleEntityClick,
      isViewingOnlyPages,
      router,
      setSelectedEntityType,
      theme.palette.blue,
      theme.palette.gray,
      webNameByWebId,
    ],
  );

  const onConversionTargetSelected = useCallback(
    ({
      columnKey,
      dataTypeId,
    }: {
      columnKey: BaseUrl;
      dataTypeId: VersionedUrl | null;
    }) => {
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

  const generateCsvFile = useCallback<GenerateCsvFileFunction>(() => {
    const csvColumns = currentlyDisplayedColumnsRef.current;
    const csvRows = currentlyDisplayedRowsRef.current;

    if (!csvColumns || !csvRows) {
      return null;
    }

    return buildCsvFile({
      columns: csvColumns,
      rows: csvRows,
      title: csvFileTitle,
      /**
       * The entities table stores actor and web ids on the row, resolving them to
       * display names elsewhere in the component. Translate them here so the export
       * matches what's shown in the grid rather than emitting raw ids.
       */
      resolveCell: (key, row) => {
        if (key === "createdById" || key === "lastEditedById") {
          return actorsByAccountId[row[key]]?.displayName ?? "";
        }

        if (key === "webId") {
          const shortname = webNameByWebId[row.webId];
          return shortname ? `@${shortname}` : "";
        }

        return undefined;
      },
    });
  }, [
    actorsByAccountId,
    csvFileTitle,
    currentlyDisplayedColumnsRef,
    currentlyDisplayedRowsRef,
    webNameByWebId,
  ]);

  const [
    { horizontalScrollbarHeight, verticalScrollbarWidth },
    setScrollbarSizes,
  ] = useState({
    horizontalScrollbarHeight: 0,
    verticalScrollbarWidth: 0,
  });

  useEffect(() => {
    const gridEl = document.querySelector<HTMLElement>(".dvn-scroller");

    if (!gridEl) {
      return;
    }

    const scrollbarHeight = gridEl.offsetHeight - gridEl.clientHeight;
    const scrollbarWidth = gridEl.offsetWidth - gridEl.clientWidth;

    setScrollbarSizes({
      horizontalScrollbarHeight: scrollbarHeight,
      verticalScrollbarWidth: scrollbarWidth,
    });
  }, [rows.length]);

  const loadMoreRowHeight = 60;

  return (
    <>
      <TableToolbar
        generateCsvFile={generateCsvFile}
        showSearch={showSearch}
        setShowSearch={setShowSearch}
        sort={sort}
        setSort={setSort}
      />
      <Stack sx={{ gap: 1, position: "relative" }}>
        <Grid
          activeConversions={activeConversions}
          columns={columns}
          conversionTargetsByColumnKey={conversionTargetsByColumnKey}
          createGetCellContent={createGetCellContent}
          currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
          customRenderers={customRenderers}
          dataLoading={false}
          enableCheckboxSelection
          experimental={{
            paddingBottom: hasMoreRowsAvailable ? loadMoreRowHeight : 0,
          }}
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
          setSort={setSort}
        />

        {hasMoreRowsAvailable && (
          <Stack
            sx={({ palette }) => ({
              alignItems: "center",
              justifyContent: "center",
              background: palette.common.white,
              borderTop: `1px solid ${palette.gray[20]}`,
              height: loadMoreRowHeight,
              position: "absolute",
              bottom: horizontalScrollbarHeight,
              p: 1,
              width: `calc(100% - ${verticalScrollbarWidth}px)`,
            })}
          >
            <Button
              component="button"
              onClick={loadMoreRows}
              disabled={entityDataLoading}
              size="small"
              sx={({ palette }) => ({
                background: palette.gray[10],
                color: palette.gray[70],
                fontSize: 14,
                fontWeight: 500,
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                "::before": {
                  background: "none",
                },
                "&:hover": {
                  background: palette.gray[15],
                  "::before": {
                    background: "none",
                  },
                },
              })}
            >
              {entityDataLoading ? (
                <>
                  <Box component="span" mr={1}>
                    Loading...
                  </Box>
                  <LoadingSpinner size={16} color={theme.palette.gray[60]} />
                </>
              ) : (
                <>
                  Show more entities
                  <Box
                    component="span"
                    sx={{ color: ({ palette }) => palette.gray[50], ml: 0.5 }}
                  >
                    {totalResultCount != null
                      ? `- ${formatNumber(totalResultCount - rows.length)} remaining`
                      : ""}
                  </Box>
                  <ArrowDownRegularIcon
                    sx={{
                      fontSize: 11,
                      ml: 0.8,
                      position: "relative",
                      top: 1,
                      color: ({ palette }) => palette.gray[50],
                    }}
                  />
                </>
              )}
            </Button>
          </Stack>
        )}
      </Stack>
    </>
  );
};
