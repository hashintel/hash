import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import {
  generateEntityLabel,
  generateLinkEntityLabel,
} from "@local/hash-isomorphic-utils/generate-entity-label";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { LinkEntityAndRightEntity } from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPropertyTypeForEntity,
} from "@local/hash-subgraph/stdlib";
import { Box, TableCell, Typography } from "@mui/material";
import type { ReactElement } from "react";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ClickableCellChip } from "../../../../../../shared/clickable-cell-chip";
import { ValueChip } from "../../../../../../shared/value-chip";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "../../../../../../shared/virtualized-table";
import { VirtualizedTable } from "../../../../../../shared/virtualized-table";
import { virtualizedTableHeaderHeight } from "../../../../../../shared/virtualized-table/header";
import type {
  VirtualizedTableFilterDefinition,
  VirtualizedTableFilterDefinitionsByFieldId,
  VirtualizedTableFilterValue,
  VirtualizedTableFilterValuesByFieldId,
} from "../../../../../../shared/virtualized-table/header/filter";
import { isValueIncludedInFilter } from "../../../../../../shared/virtualized-table/header/filter";
import type { VirtualizedTableSort } from "../../../../../../shared/virtualized-table/header/sort";
import { useVirtualizedTableFilterState } from "../../../../../../shared/virtualized-table/use-filter-state";
import { useEntityEditor } from "../../entity-editor-context";
import type { CustomColumn } from "../../shared/types";
import { PropertiesTooltip } from "../shared/properties-tooltip";
import {
  linksTableCellSx,
  linksTableFontSize,
  linksTableRowHeight,
  maxLinksTableHeight,
} from "../shared/table-styling";

const fieldIds = ["linkType", "linkedTo", "linkedToType", "link"] as const;

type OutgoingLinksFieldId = (typeof fieldIds)[number];

export type OutgoingLinksFilterValues =
  VirtualizedTableFilterValuesByFieldId<OutgoingLinksFieldId>;

const staticColumns: VirtualizedTableColumn<OutgoingLinksFieldId>[] = [
  {
    label: "Link type",
    id: "linkType",
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
    id: "linkedToType",
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

const createColumns = (customColumns: CustomColumn[]) => {
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
  targetEntityType: EntityType;
  linkEntity: Entity;
  linkEntityLabel: string;
  linkEntityProperties: { [propertyTitle: string]: string };
  linkEntityType: EntityType;
  onEntityClick: (entityId: EntityId) => void;
  customFields: { [fieldId: string]: string | number };
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
        <ValueChip
          type
          sx={{
            fontSize: linksTableFontSize,
          }}
        >
          {row.linkEntityType.title}
        </ValueChip>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <PropertiesTooltip
          entityType="target entity"
          properties={row.targetEntityProperties}
        >
          <ClickableCellChip
            onClick={() =>
              row.onEntityClick(row.targetEntity.metadata.recordId.entityId)
            }
            fontSize={linksTableFontSize}
            label={row.targetEntityLabel}
          />
        </PropertiesTooltip>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <ValueChip
          type
          sx={{
            fontSize: linksTableFontSize,
          }}
        >
          {row.targetEntityType.title}
        </ValueChip>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <PropertiesTooltip
          entityType="link entity"
          properties={row.linkEntityProperties}
        >
          <ClickableCellChip
            onClick={() =>
              row.onEntityClick(row.linkEntity.metadata.recordId.entityId)
            }
            fontSize={linksTableFontSize}
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
  outgoingLinksAndTargets: LinkEntityAndRightEntity[];
};

export const OutgoingLinksTable = memo(
  ({ outgoingLinksAndTargets }: OutgoingLinksTableProps) => {
    const [sort, setSort] = useState<
      VirtualizedTableSort<OutgoingLinksFieldId>
    >({
      fieldId: "linkedTo",
      direction: "asc",
    });

    const {
      customColumns,
      defaultOutgoingLinkFilters,
      entitySubgraph,
      onEntityClick,
    } = useEntityEditor();

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
        linkType: {
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
        linkedToType: {
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

      const entityTypesByVersionedUrl: Record<VersionedUrl, EntityType> = {};

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
            linkEntity.metadata.entityTypeId ===
            customColumn.appliesToEntityTypeId
          ) {
            customFields[customColumn.id] = customColumn.calculateValue(
              linkEntity,
              entitySubgraph,
            );
          }
        }

        const linkEntityTypeId = linkEntity.metadata.entityTypeId;

        let linkEntityType = entityTypesByVersionedUrl[linkEntityTypeId];

        if (!linkEntityType) {
          const foundType = getEntityTypeById(entitySubgraph, linkEntityTypeId);

          if (!foundType) {
            throw new Error(
              `Could not find linkEntityType with id ${linkEntityTypeId} in subgraph`,
            );
          }

          linkEntityType = foundType.schema;

          filterDefs.linkType.options[linkEntityTypeId] ??= {
            label: linkEntityType.title,
            count: 0,
            value: linkEntityTypeId,
          };
        }

        filterDefs.linkType.options[linkEntityTypeId]!.count++;
        filterDefs.linkType.initialValue.add(linkEntityTypeId);

        const rightEntity = rightEntityRevisions[0];
        if (!rightEntity) {
          throw new Error("Expected at least one right entity revision");
        }

        const rightEntityLabel = rightEntity.linkData
          ? generateLinkEntityLabel(entitySubgraph, rightEntity)
          : generateEntityLabel(entitySubgraph, rightEntity);

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

        const rightEntityTypeId = rightEntity.metadata.entityTypeId;
        let rightEntityType = entityTypesByVersionedUrl[rightEntityTypeId];

        if (!rightEntityType) {
          const foundType = getEntityTypeById(
            entitySubgraph,
            rightEntityTypeId,
          );

          if (!foundType) {
            throw new Error(
              `Could not find rightEntityType with id ${rightEntityTypeId} in subgraph`,
            );
          }

          rightEntityType = foundType.schema;

          filterDefs.linkedToType.options[rightEntityTypeId] ??= {
            label: rightEntityType.title,
            count: 0,
            value: rightEntityTypeId,
          };
        }

        filterDefs.linkedToType.options[rightEntityTypeId]!.count++;
        filterDefs.linkedToType.initialValue.add(rightEntityTypeId);

        const linkEntityLabel = generateEntityLabel(entitySubgraph, linkEntity);
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
          const { propertyType } = getPropertyTypeForEntity(
            entitySubgraph,
            linkEntityTypeId,
            propertyBaseUrl,
          );
          linkEntityProperties[propertyType.title] =
            stringifyPropertyValue(propertyValue);
        }

        const targetEntityProperties: OutgoingLinkRow["targetEntityProperties"] =
          {};
        for (const [propertyBaseUrl, propertyValue] of typedEntries(
          rightEntity.properties,
        )) {
          const { propertyType } = getPropertyTypeForEntity(
            entitySubgraph,
            rightEntityTypeId,
            propertyBaseUrl,
          );
          targetEntityProperties[propertyType.title] =
            stringifyPropertyValue(propertyValue);
        }

        rowData.push({
          id: linkEntity.metadata.recordId.entityId,
          data: {
            customFields,
            linkEntityType,
            linkEntity,
            linkEntityLabel,
            linkEntityProperties,
            onEntityClick,
            targetEntity: rightEntity,
            targetEntityLabel: rightEntityLabel,
            targetEntityProperties,
            targetEntityType: rightEntityType,
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
    }, [customColumns, entitySubgraph, outgoingLinksAndTargets, onEntityClick]);

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

    const rows = useMemo(
      () =>
        unsortedRows
          .filter((row) => {
            for (const [fieldId, currentValue] of typedEntries(filterValues)) {
              switch (fieldId) {
                case "linkType": {
                  if (
                    !isValueIncludedInFilter({
                      currentValue,
                      valueToCheck: row.data.linkEntity.metadata.entityTypeId,
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
                case "linkedToType": {
                  if (
                    !isValueIncludedInFilter({
                      currentValue,
                      valueToCheck: row.data.targetEntity.metadata.entityTypeId,
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
              case "linkType": {
                return (
                  a.data.linkEntityType.title.localeCompare(
                    b.data.linkEntityType.title,
                  ) * direction
                );
              }
              case "linkedToType": {
                return (
                  a.data.targetEntityType.title.localeCompare(
                    b.data.targetEntityType.title,
                  ) * direction
                );
              }
              case "linkedTo": {
                return (
                  a.data.targetEntityLabel.localeCompare(
                    b.data.targetEntityLabel,
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
          }),
      [filterValues, sort, unsortedRows],
    );

    const columns = useMemo(() => {
      const applicableCustomColumns = customColumns?.filter(
        (column) =>
          typeof filterValues.linkType === "object" &&
          filterValues.linkType.has(column.appliesToEntityTypeId),
      );

      return createColumns(applicableCustomColumns ?? []);
    }, [filterValues, customColumns]);

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
          filterDefinitions={filterDefinitions}
          filterValues={filterValues}
          setFilterValues={setFilterValues}
          rows={rows}
          sort={sort}
          setSort={setSort}
        />
      </Box>
    );
  },
);
