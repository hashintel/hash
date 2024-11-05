import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type {
  CustomCell,
  Item,
  NumberCell,
  TextCell,
} from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import { gridRowHeight } from "@local/hash-isomorphic-utils/data-grid";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, useTheme } from "@mui/material";
import { useRouter } from "next/router";
import type { FunctionComponent, ReactElement, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { useEntityTypeEntitiesContext } from "../../shared/entity-type-entities-context";
import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import type { FilterState } from "../../shared/table-header";
import { TableHeader, tableHeaderHeight } from "../../shared/table-header";
import type { MinimalActor } from "../../shared/use-actors";
import { isAiMachineActor } from "../../shared/use-actors";
import { useEntityTypeEntities } from "../../shared/use-entity-type-entities";
import type {
  CustomColumn,
  EntityEditorProps,
} from "../[shortname]/entities/[entity-uuid].page/entity-editor";
import { useAuthenticatedUser } from "./auth-info-context";
import type { ChipCellProps } from "./chip-cell";
import { createRenderChipCell } from "./chip-cell";
import { GridView } from "./entities-table/grid-view";
import type { TextIconCell } from "./entities-table/text-icon-cell";
import { createRenderTextIconCell } from "./entities-table/text-icon-cell";
import type { TypeEntitiesRow } from "./entities-table/use-entities-table";
import { useEntitiesTable } from "./entities-table/use-entities-table";
import { EntityEditorSlideStack } from "./entity-editor-slide-stack";
import { EntityGraphVisualizer } from "./entity-graph-visualizer";
import { TypeSlideOverStack } from "./entity-type-page/type-slide-over-stack";
import type {
  DynamicNodeSizing,
  GraphVizConfig,
  GraphVizFilters,
} from "./graph-visualizer";
import { generateEntityRootedSubgraph } from "./subgraphs";
import { TableHeaderToggle } from "./table-header-toggle";
import type { TableView } from "./table-views";
import { tableViewIcons } from "./table-views";
import { TOP_CONTEXT_BAR_HEIGHT } from "./top-context-bar";
import type { UrlCellProps } from "./url-cell";
import { createRenderUrlCell } from "./url-cell";

/**
 * @todo: avoid having to maintain this list, potentially by
 * adding an `isFile` boolean to the generated ontology IDs file.
 */
const allFileEntityTypeOntologyIds = [
  systemEntityTypes.file,
  systemEntityTypes.image,
  systemEntityTypes.documentFile,
  systemEntityTypes.docxDocument,
  systemEntityTypes.pdfDocument,
  systemEntityTypes.presentationFile,
  systemEntityTypes.pptxPresentation,
];

const allFileEntityTypeIds = allFileEntityTypeOntologyIds.map(
  ({ entityTypeId }) => entityTypeId,
) as VersionedUrl[];

const allFileEntityTypeBaseUrl = allFileEntityTypeOntologyIds.map(
  ({ entityTypeBaseUrl }) => entityTypeBaseUrl,
);

const noneString = "none";

const firstColumnLeftPadding = 16;

export const EntitiesTable: FunctionComponent<{
  customColumns?: CustomColumn[];
  defaultFilter?: FilterState;
  defaultGraphConfig?: GraphVizConfig<DynamicNodeSizing>;
  defaultGraphFilters?: GraphVizFilters;
  defaultView?: TableView;
  disableEntityOpenInNew?: boolean;
  disableTypeClick?: boolean;
  /**
   * If the user activates fullscreen, whether to fullscreen the whole page or a specific element, e.g. the graph only.
   * Currently only used in the context of the graph visualizer, but the table could be usefully fullscreened as well.
   */
  fullScreenMode?: "document" | "element";
  hideFilters?: boolean;
  hidePropertiesColumns?: boolean;
  hideColumns?: (keyof TypeEntitiesRow)[];
  loadingComponent?: ReactElement;
  maxHeight?: string | number;
  readonly?: boolean;
}> = ({
  customColumns,
  defaultFilter,
  defaultGraphConfig,
  defaultGraphFilters,
  defaultView = "Table",
  disableEntityOpenInNew,
  disableTypeClick,
  fullScreenMode,
  hideColumns,
  hideFilters,
  hidePropertiesColumns = false,
  loadingComponent,
  maxHeight,
  readonly,
}) => {
  const router = useRouter();

  const { authenticatedUser } = useAuthenticatedUser();

  const [filterState, setFilterState] = useState<FilterState>(
    defaultFilter ?? {
      includeGlobal: false,
      limitToWebs: false,
    },
  );
  const [showSearch, setShowSearch] = useState<boolean>(false);

  const [selectedEntityType, setSelectedEntityType] = useState<{
    entityTypeId: VersionedUrl;
    slideContainerRef?: RefObject<HTMLDivElement>;
  } | null>(null);

  const {
    entityTypeBaseUrl,
    entityTypeId,
    entities: lastLoadedEntities,
    entityTypes,
    hadCachedContent,
    loading,
    propertyTypes,
    subgraph: subgraphPossiblyWithoutLinks,
  } = useEntityTypeEntitiesContext();

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const isDisplayingFilesOnly = useMemo(
    () =>
      /**
       * To allow the `Grid` view to come into view on first render where
       * possible, we check whether `entityTypeId` or `entityTypeBaseUrl`
       * matches a `File` entity type from a statically defined list.
       */
      (entityTypeId && allFileEntityTypeIds.includes(entityTypeId)) ||
      (entityTypeBaseUrl &&
        allFileEntityTypeBaseUrl.includes(entityTypeBaseUrl)) ||
      /**
       * Otherwise we check the fetched `entityTypes` as a fallback.
       */
      (entityTypes?.length &&
        entityTypes.every(
          ({ $id }) => isSpecialEntityTypeLookup?.[$id]?.isFile,
        )),
    [entityTypeBaseUrl, entityTypeId, entityTypes, isSpecialEntityTypeLookup],
  );

  const supportGridView = isDisplayingFilesOnly;

  const [view, setView] = useState<TableView>(
    isDisplayingFilesOnly ? "Grid" : defaultView,
  );

  useEffect(() => {
    if (isDisplayingFilesOnly) {
      setView("Grid");
    } else {
      setView(defaultView);
    }
  }, [defaultView, isDisplayingFilesOnly]);

  const { subgraph: subgraphWithLinkedEntities } = useEntityTypeEntities({
    entityTypeBaseUrl,
    entityTypeId,
    graphResolveDepths: {
      constrainsLinksOn: { outgoing: 255 },
      constrainsLinkDestinationsOn: { outgoing: 255 },
      constrainsPropertiesOn: { outgoing: 255 },
      constrainsValuesOn: { outgoing: 255 },
      inheritsFrom: { outgoing: 255 },
      isOfType: { outgoing: 1 },
      hasLeftEntity: { outgoing: 1, incoming: 1 },
      hasRightEntity: { outgoing: 1, incoming: 1 },
    },
  });

  /**
    The subgraphWithLinkedEntities can take a long time to load with many entities.
    If absent, we pass the subgraph without linked entities so that there is _some_ data to load into the slideover,
    which will be missing links until they load in by specifically fetching selectedEntity.entityId
   */
  const subgraph = subgraphWithLinkedEntities ?? subgraphPossiblyWithoutLinks;

  const entities = useMemo(
    /**
     * If a network request is in process and there is no cached content for the request, return undefined.
     * There may be stale data in the context related to an earlier request with different variables.
     */
    () => (loading && !hadCachedContent ? undefined : lastLoadedEntities),
    [hadCachedContent, loading, lastLoadedEntities],
  );

  const { isViewingOnlyPages, hasSomeLinks } = useMemo(() => {
    let isViewingPages = true;
    let hasLinks = false;
    for (const entity of entities ?? []) {
      if (!includesPageEntityTypeId(entity.metadata.entityTypeIds)) {
        isViewingPages = false;
      }
      if (entity.linkData) {
        hasLinks = true;
      }

      if (hasLinks && !isViewingPages) {
        break;
      }
    }
    return { isViewingOnlyPages: isViewingPages, hasSomeLinks: hasLinks };
  }, [entities]);

  useEffect(() => {
    if (isViewingOnlyPages && filterState.includeArchived === undefined) {
      setFilterState((prev) => ({ ...prev, includeArchived: false }));
    }
  }, [isViewingOnlyPages, filterState]);

  const internalWebIds = useMemo(() => {
    return [
      authenticatedUser.accountId,
      ...authenticatedUser.memberOf.map(({ org }) => org.accountGroupId),
    ];
  }, [authenticatedUser]);

  const filteredEntities = useMemo(
    () =>
      entities?.filter(
        (entity) =>
          (filterState.includeGlobal
            ? true
            : internalWebIds.includes(
                extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId),
              )) &&
          (filterState.includeArchived === undefined ||
          filterState.includeArchived ||
          !includesPageEntityTypeId(entity.metadata.entityTypeIds)
            ? true
            : simplifyProperties(entity.properties as PageProperties)
                .archived !== true) &&
          (filterState.limitToWebs
            ? filterState.limitToWebs.includes(
                extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId),
              )
            : true),
      ),
    [entities, filterState, internalWebIds],
  );

  const { columns, rows } = useEntitiesTable({
    entities: filteredEntities,
    entityTypes,
    propertyTypes,
    subgraph,
    hasSomeLinks,
    hideColumns,
    hidePageArchivedColumn: !filterState.includeArchived,
    hidePropertiesColumns,
    isViewingOnlyPages,
  });

  const [selectedRows, setSelectedRows] = useState<TypeEntitiesRow[]>([]);

  const [selectedEntity, setSelectedEntity] = useState<{
    entityId: EntityId;
    options?: Pick<EntityEditorProps, "defaultOutgoingLinkFilters">;
    slideContainerRef?: RefObject<HTMLDivElement>;
    subgraph: Subgraph<EntityRootType>;
  } | null>(null);

  const handleEntityClick = useCallback(
    (
      entityId: EntityId,
      modalContainerRef?: RefObject<HTMLDivElement>,
      options?: Pick<EntityEditorProps, "defaultOutgoingLinkFilters">,
    ) => {
      if (subgraph) {
        const entitySubgraph = generateEntityRootedSubgraph(entityId, subgraph);

        setSelectedEntity({
          options,
          entityId,
          slideContainerRef: modalContainerRef,
          subgraph: entitySubgraph,
        });
      }
    },
    [subgraph],
  );

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
                      : { inbuiltIcon: "bpAsterisk" },
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
                    : { inbuiltIcon: "bpAsterisk" },
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
                      : { inbuiltIcon: "bpAsterisk" },
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

  const {
    createdByActors,
    lastEditedByActors,
    entityTypeTitles,
    noSourceCount,
    noTargetCount,
    sources,
    targets,
    webs,
  } = useMemo(() => {
    const lastEditedBySet = new Set<MinimalActor>();
    const createdBySet = new Set<MinimalActor>();
    const entityTypeTitleCount: {
      [entityTypeTitle: string]: number | undefined;
    } = {};

    let noSource = 0;
    let noTarget = 0;

    const sourcesByEntityId: {
      [entityId: string]: {
        count: number;
        entityId: string;
        label: string;
      };
    } = {};
    const targetsByEntityId: {
      [entityId: string]: {
        count: number;
        entityId: string;
        label: string;
      };
    } = {};

    const webCountById: { [web: string]: number } = {};
    for (const row of rows ?? []) {
      if (row.lastEditedBy && row.lastEditedBy !== "loading") {
        lastEditedBySet.add(row.lastEditedBy);
      }
      if (row.createdBy && row.createdBy !== "loading") {
        createdBySet.add(row.createdBy);
      }

      if (row.sourceEntity) {
        sourcesByEntityId[row.sourceEntity.entityId] ??= {
          count: 0,
          entityId: row.sourceEntity.entityId,
          label: row.sourceEntity.label,
        };
        sourcesByEntityId[row.sourceEntity.entityId]!.count++;
      } else {
        noSource++;
      }

      if (row.targetEntity) {
        targetsByEntityId[row.targetEntity.entityId] ??= {
          count: 0,
          entityId: row.targetEntity.entityId,
          label: row.targetEntity.label,
        };
        targetsByEntityId[row.targetEntity.entityId]!.count++;
      } else {
        noTarget++;
      }

      for (const entityType of row.entityTypes) {
        entityTypeTitleCount[entityType.title] ??= 0;
        entityTypeTitleCount[entityType.title]!++;
      }

      webCountById[row.web] ??= 0;
      webCountById[row.web]!++;
    }
    return {
      lastEditedByActors: [...lastEditedBySet],
      createdByActors: [...createdBySet],
      entityTypeTitles: entityTypeTitleCount,
      webs: webCountById,
      noSourceCount: noSource,
      noTargetCount: noTarget,
      sources: Object.values(sourcesByEntityId),
      targets: Object.values(targetsByEntityId),
    };
  }, [rows]);

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

  const currentlyDisplayedRowsRef = useRef<TypeEntitiesRow[] | null>(null);

  const maximumTableHeight =
    maxHeight ??
    `calc(100vh - (${
      HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 185 + tableHeaderHeight
    }px + ${theme.spacing(5)} + ${theme.spacing(5)}))`;

  const isPrimaryEntity = useCallback(
    (entity: { metadata: Pick<Entity["metadata"], "entityTypeIds"> }) =>
      entityTypeBaseUrl
        ? entity.metadata.entityTypeIds.some(
            (typeId) => extractBaseUrl(typeId) === entityTypeBaseUrl,
          )
        : entityTypeId
          ? entity.metadata.entityTypeIds.includes(entityTypeId)
          : false,
    [entityTypeId, entityTypeBaseUrl],
  );

  return (
    <>
      {selectedEntityType && (
        <TypeSlideOverStack
          rootTypeId={selectedEntityType.entityTypeId}
          onClose={() => setSelectedEntityType(null)}
          slideContainerRef={selectedEntityType.slideContainerRef}
        />
      )}
      {selectedEntity ? (
        <EntityEditorSlideStack
          customColumns={customColumns}
          /*
            The subgraphWithLinkedEntities can take a long time to load with many entities.
            We pass the subgraph without linked entities so that there is _some_ data to load into the editor,
            which will be missing links. passing entityId below means the slideover fetches the entity
            with its links, so they'll load in shortly.
            It's unlikely subgraphWithLinkedEntities will be used but if it happens to be available already,
            it means the links will load in immediately.
           */
          entitySubgraph={selectedEntity.subgraph}
          disableTypeClick={disableTypeClick}
          hideOpenInNew={disableEntityOpenInNew}
          rootEntityId={selectedEntity.entityId}
          rootEntityOptions={{
            defaultOutgoingLinkFilters:
              selectedEntity.options?.defaultOutgoingLinkFilters,
          }}
          onClose={() => setSelectedEntity(null)}
          onSubmit={() => {
            throw new Error(`Editing not yet supported from this screen`);
          }}
          readonly
          /*
             If we've been given a specific DOM element to contain the modal, pass it here.
             This is for use when attaching to the body is not suitable (e.g. a specific DOM element is full-screened).
           */
          slideContainerRef={selectedEntity.slideContainerRef}
        />
      ) : null}
      <Box>
        <TableHeader
          hideFilters={hideFilters}
          internalWebIds={internalWebIds}
          itemLabelPlural={isViewingOnlyPages ? "pages" : "entities"}
          items={entities}
          selectedItems={
            entities?.filter((entity) =>
              selectedRows.some(
                ({ entityId }) =>
                  entity.metadata.recordId.entityId === entityId,
              ),
            ) ?? []
          }
          title="Entities"
          columns={columns}
          currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
          // getAdditionalCsvData={getEntitiesTableAdditionalCsvData}
          hideExportToCsv={view !== "Table"}
          endAdornment={
            <TableHeaderToggle
              value={view}
              setValue={setView}
              options={(
                [
                  "Table",
                  ...(supportGridView ? (["Grid"] as const) : []),
                  "Graph",
                ] as const satisfies TableView[]
              ).map((optionValue) => ({
                icon: tableViewIcons[optionValue],
                label: `${optionValue} view`,
                value: optionValue,
              }))}
            />
          }
          filterState={filterState}
          setFilterState={setFilterState}
          toggleSearch={
            view === "Table" ? () => setShowSearch(true) : undefined
          }
          onBulkActionCompleted={() => setSelectedRows([])}
        />
        {!subgraph ? null : view === "Graph" ? (
          <Box height={maximumTableHeight}>
            <EntityGraphVisualizer
              defaultConfig={defaultGraphConfig}
              defaultFilters={defaultGraphFilters}
              entities={filteredEntities}
              fullScreenMode={fullScreenMode}
              loadingComponent={loadingComponent}
              isPrimaryEntity={isPrimaryEntity}
              onEntityClick={handleEntityClick}
              subgraphWithTypes={subgraph}
            />
          </Box>
        ) : view === "Grid" ? (
          <GridView entities={entities} />
        ) : (
          <Grid
            showSearch={showSearch}
            onSearchClose={() => setShowSearch(false)}
            columns={columns}
            columnFilters={columnFilters}
            dataLoading={loading}
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
                 (${rows?.length ? rows.length : 1} * ${gridRowHeight}px) +
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
        )}
      </Box>
    </>
  );
};
