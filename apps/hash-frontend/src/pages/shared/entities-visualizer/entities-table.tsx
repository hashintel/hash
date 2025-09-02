import { useQuery } from "@apollo/client";
import type {
  ActorEntityUuid,
  BaseUrl,
  EntityId,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractEntityUuidFromEntityId,
  extractVersion,
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
import { ArrowDownRegularIcon, LoadingSpinner } from "@hashintel/design-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { useRouter } from "next/router";
import type {
  Dispatch,
  FunctionComponent,
  MutableRefObject,
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
import { useGetOwnerForEntity } from "../../../components/hooks/use-get-owner-for-entity";
import type {
  GetDataTypeConversionTargetsQuery,
  GetDataTypeConversionTargetsQueryVariables,
} from "../../../graphql/api-types.gen";
import { getDataTypeConversionTargetsQuery } from "../../../graphql/queries/ontology/data-type.queries";
import { Button } from "../../../shared/ui/button";
import {
  isAiMachineActor,
  type MinimalActor,
  useActors,
} from "../../../shared/use-actors";
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
  ActorTableFilterData,
  EntitiesTableColumnKey,
  EntitiesTableData,
  EntitiesTableRow,
  EntityTypeTableFilterData,
  SortableEntitiesTableColumnKey,
  WebTableFilterData,
} from "./types";
import type { EntitiesVisualizerData } from "./use-entities-visualizer-data";

const firstColumnLeftPadding = 16;

const emptyTableData: EntitiesTableData = {
  columns: [],
  rows: [],
  entityTypesWithMultipleVersionsPresent: new Set(),
  visibleRowsFilterData: {
    noSourceCount: 0,
    noTargetCount: 0,
    sources: {},
    targets: {},
  },
  visibleDataTypeIdsByPropertyBaseUrl: {},
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
    currentlyDisplayedColumnsRef: MutableRefObject<SizedGridColumn[] | null>;
    currentlyDisplayedRowsRef: RefObject<EntitiesTableRow[] | null>;
    disableTypeClick?: boolean;
    handleEntityClick: (entityId: EntityId) => void;
    loading: boolean;
    isViewingOnlyPages: boolean;
    maxHeight: string | number;
    loadMoreRows?: () => void;
    readonly?: boolean;
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
    setSort: (
      sort: GridSort<SortableEntitiesTableColumnKey> & {
        convertTo?: BaseUrl;
      },
    ) => void;
    tableData: EntitiesTableData | null;
    totalResultCount: number | null;
  }
> = ({
  activeConversions,
  createdByIds,
  currentlyDisplayedColumnsRef,
  currentlyDisplayedRowsRef,
  definitions,
  disableTypeClick,
  editionCreatedByIds,
  entities,
  handleEntityClick,
  loading: entityDataLoading,
  isViewingOnlyPages,
  maxHeight,
  loadMoreRows,
  readonly,
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
  typeIds,
  typeTitles,
  webIds,
}) => {
  const router = useRouter();

  const getOwnerForEntity = useGetOwnerForEntity();

  const editorActorIds = useMemo(() => {
    const editorIds = new Set<ActorEntityUuid>([
      ...typedKeys(editionCreatedByIds ?? {}),
      ...typedKeys(createdByIds ?? {}),
    ]);

    return [...editorIds];
  }, [createdByIds, editionCreatedByIds]);

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
    if (!webIds) {
      return {};
    }

    const webNameByOwner: Record<WebId, string> = {};

    for (const webId of typedKeys(webIds)) {
      const owner = getOwnerForEntity({ webId });
      webNameByOwner[webId] = owner.shortname;
    }

    return webNameByOwner;
  }, [getOwnerForEntity, webIds]);

  const {
    columns,
    entityTypesWithMultipleVersionsPresent,
    rows,
    visibleDataTypeIdsByPropertyBaseUrl,
  } = tableData ?? emptyTableData;

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
      definitions?.dataTypes,
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

  const { createdByActors, entityTypeFilters, lastEditedByActors, webs } =
    useMemo<{
      createdByActors: ActorTableFilterData[];
      lastEditedByActors: ActorTableFilterData[];
      entityTypeFilters: EntityTypeTableFilterData[];
      webs: WebTableFilterData[];
    }>(() => {
      const createdBy: ActorTableFilterData[] = [];
      for (const [actorId, count] of typedEntries(createdByIds ?? {})) {
        const actor = actorsByAccountId[actorId];
        createdBy.push({
          actorId,
          count,
          displayName: actor?.displayName ?? actorId,
        });
      }

      const editedBy: ActorTableFilterData[] = [];
      for (const [actorId, count] of typedEntries(editionCreatedByIds ?? {})) {
        const actor = actorsByAccountId[actorId];
        editedBy.push({
          actorId,
          count,
          displayName: actor?.displayName ?? actorId,
        });
      }

      const types: EntityTypeTableFilterData[] = [];
      for (const [entityTypeId, count] of typedEntries(typeIds ?? {})) {
        const title = typeTitles?.[entityTypeId];

        if (!title) {
          throw new Error(
            `Could not find title for entity type ${entityTypeId}`,
          );
        }

        types.push({
          count,
          entityTypeId,
          title,
        });
      }

      const webCounts: WebTableFilterData[] = [];
      for (const [webId, count] of typedEntries(webIds ?? {})) {
        const webname = webNameByWebId[webId] ?? webId;
        webCounts.push({
          count,
          shortname: `@${webname}`,
          webId,
        });
      }

      return {
        createdByActors: createdBy,
        entityTypeFilters: types,
        lastEditedByActors: editedBy,
        webs: webCounts,
      };
    }, [
      actorsByAccountId,
      createdByIds,
      editionCreatedByIds,
      typeIds,
      typeTitles,
      webIds,
      webNameByWebId,
    ]);

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
        columnKey: "webId",
        filterItems: webs.map(({ shortname, webId, count: _count }) => ({
          id: webId,
          label: shortname,
          // @todo H-3841 –- rethink filtering
          // count,
        })),
        selectedFilterItemIds: selectedWebs,
        setSelectedFilterItemIds: setSelectedWebs,
        isRowFiltered: (row) =>
          !selectedWebs.has(extractWebIdFromEntityId(row.entityId)),
      },
      {
        columnKey: "entityTypes",
        filterItems: entityTypeFilters.map(
          ({ entityTypeId, count: _count, title }) => ({
            id: entityTypeId,
            label: title,
            // @todo H-3841 –- rethink filtering
            // count,
            labelSuffix: entityTypesWithMultipleVersionsPresent.has(
              entityTypeId,
            )
              ? `v${extractVersion(entityTypeId).toString()}`
              : undefined,
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
        columnKey: "lastEditedById",
        filterItems: lastEditedByActors.map((actor) => ({
          id: actor.actorId,
          label: actor.displayName ?? "Unknown Actor",
        })),
        selectedFilterItemIds: selectedLastEditedByAccountIds,
        setSelectedFilterItemIds: setSelectedLastEditedByAccountIds,
        isRowFiltered: (row) =>
          row.lastEditedById && row.lastEditedById !== "loading"
            ? !selectedLastEditedByAccountIds.has(row.lastEditedById)
            : false,
      },
      {
        columnKey: "createdById",
        filterItems: createdByActors.map((actor) => ({
          id: actor.actorId,
          label: actor.displayName ?? "Unknown Actor",
        })),
        selectedFilterItemIds: selectedCreatedByAccountIds,
        setSelectedFilterItemIds: setSelectedCreatedByAccountIds,
        isRowFiltered: (row) =>
          row.createdById && row.createdById !== "loading"
            ? !selectedCreatedByAccountIds.has(row.createdById)
            : false,
      },
    ],
    [
      createdByActors,
      entityTypeFilters,
      entityTypesWithMultipleVersionsPresent,
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

      {totalResultCount !== null && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          mt={1}
        >
          <Box>
            {entities !== undefined && (
              <Typography
                variant="smallTextParagraphs"
                sx={{ color: theme.palette.gray[60] }}
              >
                Viewing <strong>{formatNumber(rows.length)}</strong> of{" "}
                <strong>{formatNumber(totalResultCount)}</strong> entities
              </Typography>
            )}
          </Box>
          <Button
            onClick={loadMoreRows}
            disabled={entityDataLoading}
            size="small"
            sx={{ width: 160 }}
          >
            {entityDataLoading ? (
              <>
                <Box component="span" mr={1}>
                  Loading...
                </Box>
                <LoadingSpinner size={16} color={theme.palette.blue[60]} />
              </>
            ) : (
              <>
                Load more
                <ArrowDownRegularIcon sx={{ fontSize: 14, ml: 1 }} />
              </>
            )}
          </Button>
        </Stack>
      )}
    </Stack>
  );
};
