import { Box, Stack, TableCell, Typography } from "@mui/material";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import type { VirtualizedTableFilterValuesByFieldId } from "../../../../virtualized-table/header/filter";
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
import type { ListRange } from "react-virtuoso";

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
 * available. All other columns are not sortable.
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
   * The table is backed by a paginated server-side query: the rows are a
   * server-ordered page, sorting is applied by the query (so the table only
   * exposes the columns the graph API can sort by, and `sort`/`setSort` drive a
   * re-query when the sort changes), and filtering is applied server-side too.
   */
  sort: VirtualizedTableSort<OutgoingLinksFieldId>;
  setSort: (sort: VirtualizedTableSort<OutgoingLinksFieldId>) => void;
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
    sort,
    setSort,
    slideContainerRef,
  }: OutgoingLinksTableProps) => {
    const {
      rows,
      presentLinkEntityTypeIds,
    }: {
      rows: VirtualizedTableRow<OutgoingLinkRow>[];
      presentLinkEntityTypeIds: Set<VersionedUrl>;
    } = useMemo(() => {
      const rowData: VirtualizedTableRow<OutgoingLinkRow>[] = [];

      /**
       * The set of link entity type ids present across the loaded rows, used to
       * decide which custom columns apply.
       */
      const linkEntityTypeIds = new Set<VersionedUrl>();

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
          linkEntityTypeIds.add(linkType.$id);
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
        rows: rowData,
        presentLinkEntityTypeIds: linkEntityTypeIds,
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

    const columns = useMemo(() => {
      const applicableCustomColumns = customColumns?.filter((column) =>
        presentLinkEntityTypeIds.has(column.appliesToEntityTypeId),
      );

      const createdColumns = createColumns(applicableCustomColumns ?? []);

      /**
       * Sorting is applied server-side, so only the columns the graph API can
       * sort by are sortable.
       */
      return createdColumns.map((column) => ({
        ...column,
        sortable: serverSortableFieldIds.includes(column.id),
      }));
    }, [customColumns, presentLinkEntityTypeIds]);

    /**
     * Whether scrolling to the bottom may trigger a load of the next page. It
     * starts disarmed so that the initial range-change callback Virtuoso fires
     * on mount (which reports the rendered range including overscan, and would
     * otherwise auto-load page 2 with no user scroll when the first page fits in
     * the viewport) cannot trigger a load. It is armed only once the user
     * actually scrolls, disarmed again as soon as a load is triggered, and
     * re-armed when the user starts scrolling again – so a single scroll to the
     * bottom loads at most one page, and the user must scroll again to load more
     * (rather than the table looping while the scroll position stays at the
     * bottom).
     */
    const canLoadMoreRef = useRef(false);

    const handleIsScrolling = useCallback((isScrolling: boolean) => {
      if (isScrolling) {
        canLoadMoreRef.current = true;
      }
    }, []);

    const handleRangeChange = useMemo(
      () =>
        onEndReached
          ? ({ endIndex }: ListRange) => {
              // Load the next page once the loaded rows scroll into view
              if (
                canLoadMoreRef.current &&
                !loadingMore &&
                endIndex >= rows.length - 1
              ) {
                canLoadMoreRef.current = false;
                onEndReached();
              }
            }
          : undefined,
      [loadingMore, onEndReached, rows.length],
    );

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
          followOutput={false}
          loadingMore={loadingMore}
          onIsScrolling={handleIsScrolling}
          onRangeChange={handleRangeChange}
          rows={rows}
          sort={sort}
          setSort={setSort}
          increaseViewportBy={linksTablePageSize}
        />
      </Box>
    );
  },
);
