import { Box, Stack, TableCell, Typography } from "@mui/material";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { EntityOrTypeIcon } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
  getPropertyTypeForClosedMultiEntityType,
} from "@local/hash-graph-sdk/entity";
import {
  generateEntityLabel,
  generateLinkEntityLabel,
} from "@local/hash-isomorphic-utils/generate-entity-label";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";

import { ClickableCellChip } from "../../../../clickable-cell-chip";
import { VirtualizedTable } from "../../../../virtualized-table";
import { virtualizedTableHeaderHeight } from "../../../../virtualized-table/header";
import { isValueIncludedInFilter } from "../../../../virtualized-table/header/filter";
import { useVirtualizedTableFilterState } from "../../../../virtualized-table/use-filter-state";
import { PropertiesTooltip } from "../shared/properties-tooltip";
import {
  linksTableCellSx,
  linksTableFontSize,
  linksTableRowHeight,
  maxLinksTableHeight,
} from "../shared/table-styling";
import { linksTablePageSize } from "../use-entity-links";

import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "../../../../virtualized-table";
import type {
  VirtualizedTableFilterDefinition,
  VirtualizedTableFilterDefinitionsByFieldId,
  VirtualizedTableFilterValue,
  VirtualizedTableFilterValuesByFieldId,
} from "../../../../virtualized-table/header/filter";
import type { VirtualizedTableSort } from "../../../../virtualized-table/header/sort";
import type { CustomEntityLinksColumn } from "../../shared/types";
import type {
  EntityRootType,
  LinkEntityAndRightEntity,
  Subgraph,
} from "@blockprotocol/graph";
import type {
  Entity,
  EntityId,
  PartialEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";
import type { ReactElement, RefObject } from "react";

export type OutgoingLinksFieldId =
  | "linkTypes"
  | "linkedTo"
  | "linkedToTypes"
  | "link";

/**
 * The columns that can be sorted server-side. Sorting paths are applied to the
 * query's root (the link entities), and the graph API only exposes `label` and
 * `typeTitle` as sortable tokens (it cannot traverse to the target entity), so
 * only the link entity's label (`link`) and type title (`linkTypes`) are
 * available. When sorting is server-side the other columns are not sortable.
 */
const serverSortableFieldIds: OutgoingLinksFieldId[] = ["linkTypes", "link"];

export type OutgoingLinksFilterValues =
  VirtualizedTableFilterValuesByFieldId<OutgoingLinksFieldId>;

const staticColumns: VirtualizedTableColumn<OutgoingLinksFieldId>[] = [
  {
    label: "Link type",
    id: "linkTypes",
    sortable: true,
    width: 120,
  },
  {
    label: "Linked to",
    id: "linkedTo",
    sortable: true,
    width: 200,
  },
  {
    label: "Linked to type",
    id: "linkedToTypes",
    sortable: true,
    width: 120,
  },
  {
    label: "Link",
    id: "link",
    sortable: true,
    width: 180,
  },
];

const createColumns = (customColumns: CustomEntityLinksColumn[]) => {
  const columns = [...staticColumns];

  for (const customColumn of customColumns) {
    columns.push({
      label: customColumn.label,
      id: customColumn.id as OutgoingLinksFieldId,
      sortable: customColumn.sortable,
      width: customColumn.width,
    });
  }

  return columns;
};

type OutgoingLinkRow = {
  targetEntity: Entity;
  targetEntityLabel: string;
  targetEntityProperties: { [propertyTitle: string]: string };
  targetEntityTypes: Pick<
    PartialEntityType,
    "icon" | "$id" | "inverse" | "title"
  >[];
  linkEntity: Entity;
  linkEntityLabel: string;
  linkEntityProperties: { [propertyTitle: string]: string };
  linkEntityTypes: Pick<
    PartialEntityType,
    "icon" | "$id" | "inverse" | "title"
  >[];
  onEntityClick: (entityId: EntityId) => void;
  onTypeClick: (kind: "dataType" | "entityType", itemId: VersionedUrl) => void;
  customFields: { [fieldId: string]: string | number };
  slideContainerRef?: RefObject<HTMLDivElement | null>;
};

const TableRow = memo(({ row }: { row: OutgoingLinkRow }) => {
  const customCells: ReactElement[] = [];
  for (const [fieldId, value] of typedEntries(row.customFields)) {
    customCells.push(
      <TableCell key={fieldId} sx={linksTableCellSx}>
        <Typography sx={{ fontSize: linksTableFontSize }}>{value}</Typography>
      </TableCell>,
    );
  }

  return (
    <>
      <TableCell sx={linksTableCellSx}>
        <Stack direction="row" alignItems="center" gap={1}>
          {row.linkEntityTypes.map((linkEntityType) => (
            <ClickableCellChip
              key={linkEntityType.$id}
              fontSize={linksTableFontSize}
              isType
              icon={
                <EntityOrTypeIcon
                  entity={null}
                  fontSize={linksTableFontSize}
                  fill={({ palette }) => palette.blue[70]}
                  icon={linkEntityType.icon}
                  isLink
                />
              }
              onClick={() => row.onTypeClick("entityType", linkEntityType.$id)}
              label={linkEntityType.title}
            />
          ))}
        </Stack>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <PropertiesTooltip
          entityType="target entity"
          properties={row.targetEntityProperties}
          slideContainerRef={row.slideContainerRef}
        >
          <ClickableCellChip
            onClick={() =>
              row.onEntityClick(row.targetEntity.metadata.recordId.entityId)
            }
            fontSize={linksTableFontSize}
            icon={
              <EntityOrTypeIcon
                entity={row.targetEntity}
                fontSize={linksTableFontSize}
                fill={({ palette }) => palette.gray[50]}
                icon={row.targetEntityTypes[0]!.icon}
                isLink={!!row.targetEntity.linkData}
              />
            }
            label={row.targetEntityLabel}
          />
        </PropertiesTooltip>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <Stack direction="row" gap={1}>
          {row.targetEntityTypes.map((targetEntityType) => (
            <ClickableCellChip
              key={targetEntityType.$id}
              fontSize={linksTableFontSize}
              isType
              icon={
                <EntityOrTypeIcon
                  entity={null}
                  fontSize={linksTableFontSize}
                  fill={({ palette }) => palette.blue[70]}
                  icon={targetEntityType.icon}
                  isLink={!!row.targetEntity.linkData}
                />
              }
              label={targetEntityType.title}
              onClick={() =>
                row.onTypeClick("entityType", targetEntityType.$id)
              }
            />
          ))}
        </Stack>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <PropertiesTooltip
          entityType="link entity"
          properties={row.linkEntityProperties}
          slideContainerRef={row.slideContainerRef}
        >
          <ClickableCellChip
            onClick={() =>
              row.onEntityClick(row.linkEntity.metadata.recordId.entityId)
            }
            fontSize={linksTableFontSize}
            icon={
              <EntityOrTypeIcon
                entity={row.linkEntity}
                fontSize={linksTableFontSize}
                fill={({ palette }) => palette.gray[50]}
                icon={row.linkEntityTypes[0]!.icon}
                isLink
              />
            }
            label={row.linkEntityLabel}
          />
        </PropertiesTooltip>
      </TableCell>
      {customCells.map((customCell) => customCell)}
    </>
  );
});

const createRowContent: CreateVirtualizedRowContentFn<
  OutgoingLinkRow,
  OutgoingLinksFieldId
> = (_index, row) => <TableRow row={row.data} />;

type OutgoingLinksTableProps = {
  closedMultiEntityTypesDefinitions: ClosedMultiEntityTypesDefinitions;
  closedMultiEntityTypesMap: ClosedMultiEntityTypesRootMap | null;
  customEntityLinksColumns?: CustomEntityLinksColumn[];
  defaultOutgoingLinkFilters?: Partial<OutgoingLinksFilterValues>;
  entitySubgraph: Subgraph<EntityRootType<HashEntity>>;
  loadingMore?: boolean;
  onEndReached?: () => void;
  onEntityClick: (entityId: EntityId) => void;
  onTypeClick: (kind: "dataType" | "entityType", itemId: VersionedUrl) => void;
  outgoingLinksAndTargets: LinkEntityAndRightEntity[];
  /**
   * When `true`, the table is backed by a paginated server-side query:
   * - Sorting is applied by the query (the rows are already ordered), so the
   *   table does not re-sort locally and only exposes the columns the graph API
   *   can sort by. `sort`/`setSort` must be provided (controlled) so the parent
   *   can re-query when the sort changes.
   * - Filtering is disabled entirely, because client-side filters would only
   *   ever see the currently loaded pages.
   */
  serverSideSorting?: boolean;
  sort?: VirtualizedTableSort<OutgoingLinksFieldId>;
  setSort?: (sort: VirtualizedTableSort<OutgoingLinksFieldId>) => void;
  slideContainerRef?: RefObject<HTMLDivElement | null>;
};

export const OutgoingLinksTable = memo(
  ({
    closedMultiEntityTypesDefinitions,
    closedMultiEntityTypesMap,
    customEntityLinksColumns: customColumns,
    defaultOutgoingLinkFilters,
    entitySubgraph,
    loadingMore,
    onEndReached,
    onEntityClick,
    onTypeClick,
    outgoingLinksAndTargets,
    serverSideSorting = false,
    sort: controlledSort,
    setSort: controlledSetSort,
    slideContainerRef,
  }: OutgoingLinksTableProps) => {
    const [internalSort, setInternalSort] = useState<
      VirtualizedTableSort<OutgoingLinksFieldId>
    >({
      fieldId: "linkedTo",
      direction: "asc",
    });

    /**
     * When sorting server-side the sort is controlled by the parent (so it can
     * re-query); otherwise it is local state.
     */
    const sort = controlledSort ?? internalSort;
    const setSort = controlledSetSort ?? setInternalSort;

    const outputContainerRef = useRef<HTMLDivElement>(null);
    const [outputContainerHeight, setOutputContainerHeight] = useState(400);
    useLayoutEffect(() => {
      if (
        outputContainerRef.current &&
        outputContainerRef.current.clientHeight !== outputContainerHeight
      ) {
        setOutputContainerHeight(outputContainerRef.current.clientHeight);
      }
    }, [outputContainerHeight]);

    const {
      filterDefinitions,
      initialFilterValues,
      unsortedRows,
    }: {
      filterDefinitions: VirtualizedTableFilterDefinitionsByFieldId<OutgoingLinksFieldId>;
      initialFilterValues: VirtualizedTableFilterValuesByFieldId<OutgoingLinksFieldId>;
      unsortedRows: VirtualizedTableRow<OutgoingLinkRow>[];
    } = useMemo(() => {
      const rowData: VirtualizedTableRow<OutgoingLinkRow>[] = [];

      const filterDefs = {
        linkTypes: {
          header: "Type",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilterDefinition["options"],
          type: "checkboxes",
        },
        linkedTo: {
          header: "Name",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilterDefinition["options"],
          type: "checkboxes",
        },
        linkedToTypes: {
          header: "Type",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilterDefinition["options"],
          type: "checkboxes",
        },
        link: {
          header: "Name",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilterDefinition["options"],
          type: "checkboxes",
        },
      } as const satisfies VirtualizedTableFilterDefinitionsByFieldId<OutgoingLinksFieldId>;

      for (const {
        rightEntity: rightEntityRevisions,
        linkEntity: linkEntityRevisions,
      } of outgoingLinksAndTargets) {
        const linkEntity = linkEntityRevisions[0];

        if (!linkEntity) {
          throw new Error("Expected at least one link revision");
        }

        const customFields: OutgoingLinkRow["customFields"] = {};
        for (const customColumn of customColumns ?? []) {
          if (
            linkEntity.metadata.entityTypeIds.includes(
              customColumn.appliesToEntityTypeId,
            )
          ) {
            customFields[customColumn.id] = customColumn.calculateValue(
              linkEntity,
              entitySubgraph,
            );
          }
        }

        if (!closedMultiEntityTypesMap) {
          throw new Error("Expected closedMultiEntityTypesMap to be defined");
        }

        const linkEntityClosedMultiType = getClosedMultiEntityTypeFromMap(
          closedMultiEntityTypesMap,
          linkEntity.metadata.entityTypeIds,
        );

        const linkEntityLabel = generateEntityLabel(
          linkEntityClosedMultiType,
          linkEntity,
        );

        for (const linkType of linkEntityClosedMultiType.allOf) {
          const linkEntityTypeId = linkType.$id;

          filterDefs.linkTypes.options[linkEntityTypeId] ??= {
            label: linkType.title,
            count: 0,
            value: linkEntityTypeId,
          };

          filterDefs.linkTypes.options[linkEntityTypeId].count++;
          filterDefs.linkTypes.initialValue.add(linkEntityTypeId);
        }

        const rightEntity = rightEntityRevisions[0];
        if (!rightEntity) {
          throw new Error("Expected at least one right entity revision");
        }

        const rightEntityClosedMultiType = getClosedMultiEntityTypeFromMap(
          closedMultiEntityTypesMap,
          rightEntity.metadata.entityTypeIds,
        );

        const rightEntityLabel = rightEntity.linkData
          ? generateLinkEntityLabel(entitySubgraph, rightEntity, {
              closedType: rightEntityClosedMultiType,
              entityTypeDefinitions: closedMultiEntityTypesDefinitions,
              closedMultiEntityTypesRootMap: closedMultiEntityTypesMap,
            })
          : generateEntityLabel(rightEntityClosedMultiType, rightEntity);

        filterDefs.linkedTo.options[rightEntity.metadata.recordId.entityId] ??=
          {
            label: rightEntityLabel,
            count: 0,
            value: rightEntity.metadata.recordId.entityId,
          };
        filterDefs.linkedTo.options[rightEntity.metadata.recordId.entityId]!
          .count++;
        filterDefs.linkedTo.initialValue.add(
          rightEntity.metadata.recordId.entityId,
        );

        for (const rightType of rightEntityClosedMultiType.allOf) {
          const rightEntityTypeId = rightType.$id;

          filterDefs.linkedToTypes.options[rightEntityTypeId] ??= {
            label: rightType.title,
            count: 0,
            value: rightEntityTypeId,
          };

          filterDefs.linkedToTypes.options[rightEntityTypeId].count++;
          filterDefs.linkedToTypes.initialValue.add(rightEntityTypeId);
        }

        filterDefs.link.options[linkEntity.metadata.recordId.entityId] ??= {
          label: linkEntityLabel,
          count: 0,
          value: linkEntity.metadata.recordId.entityId,
        };
        filterDefs.link.options[linkEntity.metadata.recordId.entityId]!.count++;
        filterDefs.link.initialValue.add(linkEntity.metadata.recordId.entityId);

        const linkEntityProperties: OutgoingLinkRow["linkEntityProperties"] =
          {};
        for (const [propertyBaseUrl, propertyValue] of typedEntries(
          linkEntity.properties,
        )) {
          const propertyType = getPropertyTypeForClosedMultiEntityType(
            linkEntityClosedMultiType,
            propertyBaseUrl,
            closedMultiEntityTypesDefinitions,
          );

          linkEntityProperties[propertyType.title] =
            stringifyPropertyValue(propertyValue);
        }

        const targetEntityProperties: OutgoingLinkRow["targetEntityProperties"] =
          {};
        for (const [propertyBaseUrl, propertyValue] of typedEntries(
          rightEntity.properties,
        )) {
          const propertyType = getPropertyTypeForClosedMultiEntityType(
            rightEntityClosedMultiType,
            propertyBaseUrl,
            closedMultiEntityTypesDefinitions,
          );

          targetEntityProperties[propertyType.title] =
            stringifyPropertyValue(propertyValue);
        }

        rowData.push({
          id: linkEntity.metadata.recordId.entityId,
          data: {
            customFields,
            linkEntityTypes: linkEntityClosedMultiType.allOf.map((type) => {
              const { icon } = getDisplayFieldsForClosedEntityType(type);

              return {
                $id: type.$id,
                title: type.title,
                icon,
                inverse: type.inverse,
              };
            }),
            linkEntity,
            linkEntityLabel,
            linkEntityProperties,
            onEntityClick,
            onTypeClick,
            slideContainerRef,
            targetEntity: rightEntity,
            targetEntityLabel: rightEntityLabel,
            targetEntityProperties,
            targetEntityTypes: rightEntityClosedMultiType.allOf.map((type) => {
              const { icon } = getDisplayFieldsForClosedEntityType(type);

              return {
                $id: type.$id,
                title: type.title,
                icon,
                inverse: type.inverse,
              };
            }),
          },
        });
      }

      return {
        filterDefinitions: filterDefs,
        initialFilterValues: Object.fromEntries(
          typedEntries(filterDefs).map(
            ([columnId, filterDef]) =>
              [columnId, filterDef.initialValue] satisfies [
                OutgoingLinksFieldId,
                VirtualizedTableFilterValue,
              ],
          ),
        ) as OutgoingLinksFilterValues,
        unsortedRows: rowData,
      };
    }, [
      closedMultiEntityTypesMap,
      closedMultiEntityTypesDefinitions,
      customColumns,
      entitySubgraph,
      outgoingLinksAndTargets,
      onEntityClick,
      onTypeClick,
      slideContainerRef,
    ]);

    const [highlightOutgoingLinks, setHighlightOutgoingLinks] = useState(
      !!defaultOutgoingLinkFilters,
    );

    useEffect(() => {
      setTimeout(() => setHighlightOutgoingLinks(false), 5_000);
    }, []);

    const [filterValues, setFilterValues] = useVirtualizedTableFilterState({
      defaultFilterValues: {
        ...initialFilterValues,
        ...(defaultOutgoingLinkFilters ?? {}),
      },
      filterDefinitions,
    });

    const rows = useMemo(() => {
      if (serverSideSorting) {
        /**
         * In self-fetch mode the rows are a server-ordered, paginated page:
         * sorting is applied by the query and filtering is disabled entirely
         * (client-side filtering would only ever see the loaded pages), so the
         * rows are used as-is.
         */
        return unsortedRows;
      }

      const filteredRows = unsortedRows.filter((row) => {
        for (const [fieldId, currentValue] of typedEntries(filterValues)) {
          switch (fieldId) {
            case "linkTypes": {
              if (
                !isValueIncludedInFilter({
                  currentValue,
                  valueToCheck: row.data.linkEntity.metadata.entityTypeIds,
                })
              ) {
                return false;
              }
              break;
            }
            case "linkedTo": {
              if (
                !isValueIncludedInFilter({
                  currentValue,
                  valueToCheck:
                    row.data.targetEntity.metadata.recordId.entityId,
                })
              ) {
                return false;
              }
              break;
            }
            case "linkedToTypes": {
              if (
                !isValueIncludedInFilter({
                  currentValue,
                  valueToCheck: row.data.targetEntity.metadata.entityTypeIds,
                })
              ) {
                return false;
              }
              break;
            }
            case "link": {
              if (
                !isValueIncludedInFilter({
                  currentValue,
                  valueToCheck: row.data.linkEntity.metadata.recordId.entityId,
                })
              ) {
                return false;
              }
              break;
            }
          }
        }

        return true;
      });

      return filteredRows.sort((a, b) => {
        const field = sort.fieldId;
        const direction = sort.direction === "asc" ? 1 : -1;

        switch (field) {
          case "linkTypes": {
            return (
              a.data.linkEntityTypes[0]!.title.localeCompare(
                b.data.linkEntityTypes[0]!.title,
              ) * direction
            );
          }
          case "linkedToTypes": {
            return (
              a.data.targetEntityTypes[0]!.title.localeCompare(
                b.data.targetEntityTypes[0]!.title,
              ) * direction
            );
          }
          case "linkedTo": {
            return (
              a.data.targetEntityLabel.localeCompare(b.data.targetEntityLabel) *
              direction
            );
          }
          case "link": {
            return (
              a.data.linkEntityLabel.localeCompare(b.data.linkEntityLabel) *
              direction
            );
          }
          default: {
            const customFieldA = a.data.customFields[field];
            const customFieldB = b.data.customFields[field];
            if (
              typeof customFieldA === "number" &&
              typeof customFieldB === "number"
            ) {
              return (customFieldA - customFieldB) * direction;
            }
            return (
              String(customFieldA).localeCompare(String(customFieldB)) *
              direction
            );
          }
        }
      });
    }, [filterValues, serverSideSorting, sort, unsortedRows]);

    const columns = useMemo(() => {
      const applicableCustomColumns = customColumns?.filter(
        (column) =>
          typeof filterValues.linkTypes === "object" &&
          filterValues.linkTypes.has(column.appliesToEntityTypeId),
      );

      const createdColumns = createColumns(applicableCustomColumns ?? []);

      if (!serverSideSorting) {
        return createdColumns;
      }

      /**
       * When sorting is server-side, only the columns the graph API can sort by
       * are sortable.
       */
      return createdColumns.map((column) => ({
        ...column,
        sortable: serverSortableFieldIds.includes(column.id),
      }));
    }, [filterValues, customColumns, serverSideSorting]);

    /**
     * Whether scrolling to the bottom may trigger a load of the next page. It is
     * disarmed as soon as a load is triggered and only re-armed when the user
     * starts scrolling again – so a single scroll to the bottom loads at most
     * one page, and the user must scroll again to load more (rather than the
     * table looping while the scroll position stays at the bottom).
     */
    const canLoadMoreRef = useRef(true);

    const height = Math.min(
      maxLinksTableHeight,
      rows.length * linksTableRowHeight + virtualizedTableHeaderHeight + 2,
    );

    return (
      <Box
        sx={({ palette, transitions }) => ({
          borderRadius: 2,
          height,
          outlineOffset: 3,
          outline: "2px solid transparent",
          transition: transitions.create("outline-color", { duration: 500 }),
          ...(highlightOutgoingLinks
            ? {
                outline: `2px solid ${palette.blue[70]}`,
              }
            : {}),
        })}
      >
        <VirtualizedTable
          columns={columns}
          createRowContent={createRowContent}
          filterDefinitions={serverSideSorting ? undefined : filterDefinitions}
          filterValues={serverSideSorting ? undefined : filterValues}
          fixedItemHeight={linksTableRowHeight}
          followOutput={false}
          loadingMore={loadingMore}
          onIsScrolling={(isScrolling) => {
            if (isScrolling) {
              canLoadMoreRef.current = true;
            }
          }}
          onRangeChange={
            onEndReached
              ? ({ endIndex }) => {
                  // Load the next page once the loaded rows scroll into view,
                  // before the placeholder rows are reached.
                  if (
                    canLoadMoreRef.current &&
                    !loadingMore &&
                    endIndex >= rows.length - 1
                  ) {
                    canLoadMoreRef.current = false;
                    onEndReached();
                  }
                }
              : undefined
          }
          setFilterValues={serverSideSorting ? undefined : setFilterValues}
          rows={rows}
          sort={sort}
          setSort={setSort}
          increaseViewportBy={linksTablePageSize}
        />
      </Box>
    );
  },
);
