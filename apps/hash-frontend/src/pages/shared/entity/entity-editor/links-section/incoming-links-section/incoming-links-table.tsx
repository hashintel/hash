import { Box, Stack, TableCell, Typography } from "@mui/material";
import {
  memo,
  type ReactElement,
  type RefObject,
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
import type { DraftLinksToArchive } from "../../../shared/use-draft-link-state";
import type { CustomEntityLinksColumn } from "../../shared/types";
import type {
  EntityRootType,
  LinkEntityAndLeftEntity,
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

export type IncomingLinksFieldId =
  | "linkedFrom"
  | "linkTypes"
  | "linkedFromTypes"
  | "link";

type FieldId = IncomingLinksFieldId;

/**
 * The columns that can be sorted server-side. Sorting paths are applied to the
 * query's root (the link entities), and the graph API only exposes `label` and
 * `typeTitle` as sortable tokens (it cannot traverse to the source entity).
 *
 * Only the link entity's label (`link`) is included: the API cannot sort by the
 * source entity (`linkedFrom`/`linkedFromTypes`), and although it can sort by
 * the link's `typeTitle`, the "Link type" column displays the *inverse* title,
 * so a `typeTitle` sort would not match what is shown. When sorting is
 * server-side the other columns are therefore not sortable.
 */
const serverSortableFieldIds: FieldId[] = ["link"];

const staticColumns: VirtualizedTableColumn<FieldId>[] = [
  {
    label: "Linked from",
    id: "linkedFrom",
    sortable: true,
    width: 180,
  },
  {
    label: "Link type",
    id: "linkTypes",
    sortable: true,
    width: 160,
  },
  {
    label: "Linked from type",
    id: "linkedFromTypes",
    sortable: true,
    width: 120,
  },
  {
    label: "Link",
    id: "link",
    sortable: true,
    width: 120,
  },
];

const createColumns = (customColumns: CustomEntityLinksColumn[]) => {
  const columns = [...staticColumns];

  for (const customColumn of customColumns) {
    columns.push({
      label: customColumn.label,
      id: customColumn.id as FieldId,
      sortable: customColumn.sortable,
      width: customColumn.width,
    });
  }

  return columns;
};

type IncomingLinkRow = {
  sourceEntity: Entity;
  sourceEntityLabel: string;
  sourceEntityProperties: { [propertyTitle: string]: string };
  sourceEntityTypes: Pick<
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
  entityLabel: string;
  slideContainerRef?: RefObject<HTMLDivElement | null>;
};

const TableRow = memo(({ row }: { row: IncomingLinkRow }) => {
  const { entityLabel } = row;

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
        <PropertiesTooltip
          entityType="source entity"
          properties={row.sourceEntityProperties}
          slideContainerRef={row.slideContainerRef}
        >
          <ClickableCellChip
            onClick={() =>
              row.onEntityClick(row.sourceEntity.metadata.recordId.entityId)
            }
            fontSize={linksTableFontSize}
            label={row.sourceEntityLabel}
            icon={
              <EntityOrTypeIcon
                entity={row.sourceEntity}
                fontSize={linksTableFontSize}
                fill={({ palette }) => palette.gray[50]}
                icon={row.sourceEntityTypes[0]!.icon}
                isLink={!!row.sourceEntity.linkData}
              />
            }
          />
        </PropertiesTooltip>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <Stack direction="row" alignItems="center">
          {row.linkEntityTypes.map((linkEntityType) => (
            <ClickableCellChip
              key={linkEntityType.$id}
              fontSize={linksTableFontSize}
              hideArrow
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
              /* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want an empty string */
              label={linkEntityType.inverse?.title || linkEntityType.title}
            />
          ))}
          <Typography
            sx={{
              display: "block",
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
              fontSize: linksTableFontSize,
              color: ({ palette }) => palette.gray[50],
              maxWidth: "100%",
              ml: 1,
            }}
          >
            {entityLabel}
          </Typography>
        </Stack>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <Stack direction="row" gap={1}>
          {row.sourceEntityTypes.map((sourceEntityType) => (
            <ClickableCellChip
              key={sourceEntityType.$id}
              fontSize={linksTableFontSize}
              isType
              icon={
                <EntityOrTypeIcon
                  entity={null}
                  fontSize={linksTableFontSize}
                  fill={({ palette }) => palette.blue[70]}
                  icon={sourceEntityType.icon}
                  isLink={!!row.sourceEntity.linkData}
                />
              }
              label={sourceEntityType.title}
              onClick={() =>
                row.onTypeClick("entityType", sourceEntityType.$id)
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
            onClick={() => row.onEntityClick(row.linkEntity.entityId)}
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
  IncomingLinkRow,
  FieldId
> = (_index, row) => <TableRow row={row.data} />;

type IncomingLinksTableProps = {
  closedMultiEntityTypesDefinitions: ClosedMultiEntityTypesDefinitions;
  closedMultiEntityTypesMap: ClosedMultiEntityTypesRootMap | null;
  customEntityLinksColumns?: CustomEntityLinksColumn[];
  draftLinksToArchive: DraftLinksToArchive;
  entityLabel: string;
  entitySubgraph: Subgraph<EntityRootType<HashEntity>>;
  incomingLinksAndSources: LinkEntityAndLeftEntity[];
  loadingMore?: boolean;
  onEndReached?: () => void;
  onEntityClick: (entityId: EntityId) => void;
  onTypeClick: (kind: "dataType" | "entityType", itemId: VersionedUrl) => void;
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
  sort?: VirtualizedTableSort<FieldId>;
  setSort?: (sort: VirtualizedTableSort<FieldId>) => void;
  slideContainerRef?: RefObject<HTMLDivElement | null>;
};

export const IncomingLinksTable = memo(
  ({
    closedMultiEntityTypesDefinitions,
    closedMultiEntityTypesMap,
    customEntityLinksColumns: customColumns,
    draftLinksToArchive,
    entityLabel,
    entitySubgraph,
    incomingLinksAndSources,
    loadingMore,
    onEndReached,
    onEntityClick,
    onTypeClick,
    serverSideSorting = false,
    sort: controlledSort,
    setSort: controlledSetSort,
    slideContainerRef,
  }: IncomingLinksTableProps) => {
    const [internalSort, setInternalSort] = useState<
      VirtualizedTableSort<FieldId>
    >({
      fieldId: "linkedFrom",
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
      filterDefinitions: VirtualizedTableFilterDefinitionsByFieldId<FieldId>;
      initialFilterValues: VirtualizedTableFilterValuesByFieldId<FieldId>;
      unsortedRows: VirtualizedTableRow<IncomingLinkRow>[];
    } = useMemo(() => {
      const rowData: VirtualizedTableRow<IncomingLinkRow>[] = [];

      const filterDefs = {
        linkTypes: {
          header: "Type",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilterDefinition["options"],
          type: "checkboxes",
        },
        linkedFrom: {
          header: "Name",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilterDefinition["options"],
          type: "checkboxes",
        },
        linkedFromTypes: {
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
      } as const satisfies VirtualizedTableFilterDefinitionsByFieldId<FieldId>;

      for (const {
        leftEntity: leftEntityRevisions,
        linkEntity: linkEntityRevisions,
      } of incomingLinksAndSources) {
        const linkEntity = linkEntityRevisions[0];
        if (!linkEntity) {
          throw new Error("Expected at least one link revision");
        }

        const isMarkedToArchive = draftLinksToArchive.some(
          (markedLinkId) => markedLinkId === linkEntity.entityId,
        );

        if (isMarkedToArchive) {
          continue;
        }

        const linkEntityTypeIds = linkEntity.metadata.entityTypeIds;

        const customFields: IncomingLinkRow["customFields"] = {};
        for (const customColumn of customColumns ?? []) {
          if (linkEntityTypeIds.includes(customColumn.appliesToEntityTypeId)) {
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

        const leftEntity = leftEntityRevisions[0];
        if (!leftEntity) {
          throw new Error("Expected at least one left entity revision");
        }

        const leftEntityClosedMultiType = getClosedMultiEntityTypeFromMap(
          closedMultiEntityTypesMap,
          leftEntity.metadata.entityTypeIds,
        );

        const leftEntityLabel = leftEntity.linkData
          ? generateLinkEntityLabel(entitySubgraph, leftEntity, {
              closedType: leftEntityClosedMultiType,
              entityTypeDefinitions: closedMultiEntityTypesDefinitions,
              closedMultiEntityTypesRootMap: closedMultiEntityTypesMap,
            })
          : generateEntityLabel(leftEntityClosedMultiType, leftEntity);

        filterDefs.linkedFrom.options[leftEntity.metadata.recordId.entityId] ??=
          {
            label: leftEntityLabel,
            count: 0,
            value: leftEntity.metadata.recordId.entityId,
          };
        filterDefs.linkedFrom.options[leftEntity.metadata.recordId.entityId]!
          .count++;
        filterDefs.linkedFrom.initialValue.add(
          leftEntity.metadata.recordId.entityId,
        );

        for (const leftType of leftEntityClosedMultiType.allOf) {
          const leftEntityTypeId = leftType.$id;

          filterDefs.linkedFromTypes.options[leftEntityTypeId] ??= {
            label: leftType.title,
            count: 0,
            value: leftEntityTypeId,
          };

          filterDefs.linkedFromTypes.options[leftEntityTypeId].count++;
          filterDefs.linkedFromTypes.initialValue.add(leftEntityTypeId);
        }

        filterDefs.link.options[linkEntity.metadata.recordId.entityId] ??= {
          label: linkEntityLabel,
          count: 0,
          value: linkEntity.metadata.recordId.entityId,
        };
        filterDefs.link.options[linkEntity.metadata.recordId.entityId]!.count++;
        filterDefs.link.initialValue.add(linkEntity.metadata.recordId.entityId);

        const linkEntityProperties: IncomingLinkRow["linkEntityProperties"] =
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

        const sourceEntityProperties: IncomingLinkRow["sourceEntityProperties"] =
          {};
        for (const [propertyBaseUrl, propertyValue] of typedEntries(
          leftEntity.properties,
        )) {
          const propertyType = getPropertyTypeForClosedMultiEntityType(
            leftEntityClosedMultiType,
            propertyBaseUrl,
            closedMultiEntityTypesDefinitions,
          );

          sourceEntityProperties[propertyType.title] =
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
            entityLabel,
            linkEntity,
            linkEntityLabel,
            linkEntityProperties,
            onEntityClick,
            onTypeClick,
            slideContainerRef,
            sourceEntity: leftEntity,
            sourceEntityLabel: leftEntityLabel,
            sourceEntityProperties,
            sourceEntityTypes: leftEntityClosedMultiType.allOf.map((type) => {
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
                FieldId,
                VirtualizedTableFilterValue,
              ],
          ),
        ) as VirtualizedTableFilterValuesByFieldId<FieldId>,
        unsortedRows: rowData,
      };
    }, [
      closedMultiEntityTypesDefinitions,
      closedMultiEntityTypesMap,
      customColumns,
      draftLinksToArchive,
      entityLabel,
      entitySubgraph,
      incomingLinksAndSources,
      onEntityClick,
      onTypeClick,
      slideContainerRef,
    ]);

    const [filterValues, setFilterValues] = useVirtualizedTableFilterState({
      defaultFilterValues: initialFilterValues,
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

      return unsortedRows
        .filter((row) => {
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
              case "linkedFrom": {
                if (
                  !isValueIncludedInFilter({
                    currentValue,
                    valueToCheck:
                      row.data.sourceEntity.metadata.recordId.entityId,
                  })
                ) {
                  return false;
                }
                break;
              }
              case "linkedFromTypes": {
                if (
                  !isValueIncludedInFilter({
                    currentValue,
                    valueToCheck: row.data.sourceEntity.metadata.entityTypeIds,
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
                    valueToCheck:
                      row.data.linkEntity.metadata.recordId.entityId,
                  })
                ) {
                  return false;
                }
                break;
              }
            }
          }

          return true;
        })
        .sort((a, b) => {
          const field = sort.fieldId;
          const direction = sort.direction === "asc" ? 1 : -1;

          switch (field) {
            case "linkTypes": {
              const aValue =
                /* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want an empty string */
                a.data.linkEntityTypes[0]!.inverse?.title ||
                a.data.linkEntityTypes[0]!.title;

              const bValue =
                /* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want an empty string */
                b.data.linkEntityTypes[0]!.inverse?.title ||
                b.data.linkEntityTypes[0]!.title;

              return aValue.localeCompare(bValue) * direction;
            }
            case "linkedFromTypes": {
              return (
                a.data.sourceEntityTypes[0]!.title.localeCompare(
                  b.data.sourceEntityTypes[0]!.title,
                ) * direction
              );
            }
            case "linkedFrom": {
              return (
                a.data.sourceEntityLabel.localeCompare(
                  b.data.sourceEntityLabel,
                ) * direction
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

    const height = Math.min(
      maxLinksTableHeight,
      rows.length * linksTableRowHeight + virtualizedTableHeaderHeight + 2,
    );

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

    return (
      <Box sx={{ height }}>
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
