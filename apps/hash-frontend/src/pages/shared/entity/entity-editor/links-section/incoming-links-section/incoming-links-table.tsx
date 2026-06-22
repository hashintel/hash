import { Box, Stack, TableCell, Typography } from "@mui/material";
import {
  memo,
  type ReactElement,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
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
import type { VirtualizedTableSort } from "../../../../virtualized-table/header/sort";
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
import type { ListRange } from "react-virtuoso";

export type IncomingLinksFieldId =
  | "linkedFrom"
  | "linkTypes"
  | "linkedFromTypes"
  | "link";

type FieldId = IncomingLinksFieldId;

/**
 * The columns that can be sorted server-side (applied to the query's root, the
 * link entities). None can be:
 * - the API cannot traverse to the source entity, so `linkedFrom` /
 *   `linkedFromTypes` are out;
 * - the "Link type" column displays the *inverse* title, which the `typeTitle`
 *   token does not match;
 * - the "Link" column shows a client-generated label (see `generateEntityLabel`),
 *   but the API's `label` token sorts by the entity's label *property*, which is
 *   empty for typical link entities — so every row ties and only the `uuid`
 *   tiebreaker orders them (flipping the direction does nothing, and the order
 *   does not match the displayed label).
 *
 * Every column is therefore sortable only client-side (the editable case); in
 * the readonly/paginated case the rows keep their server (uuid) order.
 */
const serverSortableFieldIds: FieldId[] = [];

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
  entityLabel: string;
  entitySubgraph: Subgraph<EntityRootType<HashEntity>>;
  incomingLinksAndSources: LinkEntityAndLeftEntity[];
  loadingMore?: boolean;
  onEndReached?: () => void;
  onEntityClick: (entityId: EntityId) => void;
  onTypeClick: (kind: "dataType" | "entityType", itemId: VersionedUrl) => void;
  /**
   * When `true`, the table is backed by a paginated server-side query: the rows
   * are a server-ordered page, sorting is applied by the query (so the table
   * only exposes the columns the graph API can sort by, and `sort`/`setSort`
   * drive a re-query when the sort changes), and filtering is applied
   * server-side too.
   *
   * When `false` (the editable case), the full set of links is already present,
   * so sorting is applied client-side instead: every column is sortable and the
   * rows are re-ordered locally as `sort` changes.
   */
  readonly: boolean;
  sort: VirtualizedTableSort<FieldId>;
  setSort: (sort: VirtualizedTableSort<FieldId>) => void;
  slideContainerRef?: RefObject<HTMLDivElement | null>;
};

export const IncomingLinksTable = memo(
  ({
    closedMultiEntityTypesDefinitions,
    closedMultiEntityTypesMap,
    customEntityLinksColumns: customColumns,
    entityLabel,
    entitySubgraph,
    incomingLinksAndSources,
    loadingMore,
    onEndReached,
    onEntityClick,
    onTypeClick,
    readonly,
    sort,
    setSort,
    slideContainerRef,
  }: IncomingLinksTableProps) => {
    const {
      rows,
      presentLinkEntityTypeIds,
    }: {
      rows: VirtualizedTableRow<IncomingLinkRow>[];
      presentLinkEntityTypeIds: Set<VersionedUrl>;
    } = useMemo(() => {
      const rowData: VirtualizedTableRow<IncomingLinkRow>[] = [];

      /**
       * The set of link entity type ids present across the loaded rows, used to
       * decide which custom columns apply.
       */
      const linkEntityTypeIds = new Set<VersionedUrl>();

      for (const {
        leftEntity: leftEntityRevisions,
        linkEntity: linkEntityRevisions,
      } of incomingLinksAndSources) {
        const linkEntity = linkEntityRevisions[0];
        if (!linkEntity) {
          throw new Error("Expected at least one link revision");
        }

        const customFields: IncomingLinkRow["customFields"] = {};
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
        rows: rowData,
        presentLinkEntityTypeIds: linkEntityTypeIds,
      };
    }, [
      closedMultiEntityTypesDefinitions,
      closedMultiEntityTypesMap,
      customColumns,
      entityLabel,
      entitySubgraph,
      incomingLinksAndSources,
      onEntityClick,
      onTypeClick,
      slideContainerRef,
    ]);

    /**
     * When readonly the rows are a server-ordered page and are used as-is.
     * Otherwise the full set of links is present, so we sort them client-side
     * according to the current `sort`.
     */
    const sortedRows = useMemo(() => {
      if (readonly) {
        return rows;
      }

      const direction = sort.direction === "asc" ? 1 : -1;

      return [...rows].sort((a, b) => {
        switch (sort.fieldId) {
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
              a.data.sourceEntityLabel.localeCompare(b.data.sourceEntityLabel) *
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
            const customFieldA = a.data.customFields[sort.fieldId];
            const customFieldB = b.data.customFields[sort.fieldId];
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
    }, [readonly, rows, sort]);

    const columns = useMemo(() => {
      const applicableCustomColumns = customColumns?.filter((column) =>
        presentLinkEntityTypeIds.has(column.appliesToEntityTypeId),
      );

      const createdColumns = createColumns(applicableCustomColumns ?? []);

      if (!readonly) {
        /**
         * Sorting is applied client-side, so each column keeps its own
         * `sortable` flag.
         */
        return createdColumns;
      }

      /**
       * Sorting is applied server-side, so only the columns the graph API can
       * sort by are sortable.
       */
      return createdColumns.map((column) => ({
        ...column,
        sortable: serverSortableFieldIds.includes(column.id),
      }));
    }, [customColumns, presentLinkEntityTypeIds, readonly]);

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
      sortedRows.length * linksTableRowHeight +
        virtualizedTableHeaderHeight +
        2,
    );

    return (
      <Box sx={{ height }}>
        <VirtualizedTable
          columns={columns}
          createRowContent={createRowContent}
          followOutput={false}
          loadingMore={loadingMore}
          onIsScrolling={handleIsScrolling}
          onRangeChange={handleRangeChange}
          rows={sortedRows}
          sort={sort}
          setSort={setSort}
          increaseViewportBy={linksTablePageSize}
        />
      </Box>
    );
  },
);
