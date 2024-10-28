import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import {
  generateEntityLabel,
  generateLinkEntityLabel,
} from "@local/hash-isomorphic-utils/generate-entity-label";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { LinkEntityAndLeftEntity } from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPropertyTypeForEntity,
} from "@local/hash-subgraph/stdlib";
import { Box, Stack, TableCell, Typography } from "@mui/material";
import {
  memo,
  type ReactElement,
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

const fieldIds = ["linkedFrom", "linkType", "linkedFromType", "link"] as const;

type FieldId = (typeof fieldIds)[number];

const staticColumns: VirtualizedTableColumn<FieldId>[] = [
  {
    label: "Linked from",
    id: "linkedFrom",
    sortable: true,
    width: 180,
  },
  {
    label: "Link type",
    id: "linkType",
    sortable: true,
    width: 160,
  },
  {
    label: "Linked from type",
    id: "linkedFromType",
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

const createColumns = (customColumns: CustomColumn[]) => {
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
  sourceEntityType: EntityType;
  linkEntity: Entity;
  linkEntityLabel: string;
  linkEntityProperties: { [propertyTitle: string]: string };
  linkEntityType: EntityType;
  onEntityClick: (entityId: EntityId) => void;
  customFields: { [fieldId: string]: string | number };
};

const TableRow = memo(({ row }: { row: IncomingLinkRow }) => {
  const { entityLabel } = useEntityEditor();

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
        >
          <ClickableCellChip
            onClick={() =>
              row.onEntityClick(row.sourceEntity.metadata.recordId.entityId)
            }
            fontSize={linksTableFontSize}
            label={row.sourceEntityLabel}
          />
        </PropertiesTooltip>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <Stack direction="row" alignItems="center">
          <ValueChip
            showInFull
            type
            sx={{
              fontSize: linksTableFontSize,
            }}
          >
            {row.linkEntityType.title}
          </ValueChip>
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
        <ValueChip
          type
          sx={{
            fontSize: linksTableFontSize,
          }}
        >
          {row.sourceEntityType.title}
        </ValueChip>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <PropertiesTooltip
          entityType="link entity"
          properties={row.linkEntityProperties}
        >
          <ClickableCellChip
            onClick={() => row.onEntityClick(row.linkEntity.entityId)}
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
  IncomingLinkRow,
  FieldId
> = (_index, row) => <TableRow row={row.data} />;

type IncomingLinksTableProps = {
  incomingLinksAndSources: LinkEntityAndLeftEntity[];
};

export const IncomingLinksTable = memo(
  ({ incomingLinksAndSources }: IncomingLinksTableProps) => {
    const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
      fieldId: "linkedFrom",
      direction: "asc",
    });

    const { customColumns, entitySubgraph, onEntityClick } = useEntityEditor();

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
        linkType: {
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
        linkedFromType: {
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

      const entityTypesByVersionedUrl: Record<VersionedUrl, EntityType> = {};

      for (const {
        leftEntity: leftEntityRevisions,
        linkEntity: linkEntityRevisions,
      } of incomingLinksAndSources) {
        const linkEntity = linkEntityRevisions[0];
        if (!linkEntity) {
          throw new Error("Expected at least one link revision");
        }

        const linkEntityTypeId = linkEntity.metadata.entityTypeId;

        const customFields: IncomingLinkRow["customFields"] = {};
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

        const leftEntity = leftEntityRevisions[0];
        if (!leftEntity) {
          throw new Error("Expected at least one left entity revision");
        }

        const leftEntityLabel = leftEntity.linkData
          ? generateLinkEntityLabel(entitySubgraph, leftEntity)
          : generateEntityLabel(entitySubgraph, leftEntity);

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

        const leftEntityTypeId = leftEntity.metadata.entityTypeId;
        let leftEntityType = entityTypesByVersionedUrl[leftEntityTypeId];

        if (!leftEntityType) {
          const foundType = getEntityTypeById(entitySubgraph, leftEntityTypeId);

          if (!foundType) {
            throw new Error(
              `Could not find leftEntityType with id ${leftEntityTypeId} in subgraph`,
            );
          }

          leftEntityType = foundType.schema;

          filterDefs.linkedFromType.options[leftEntityTypeId] ??= {
            label: leftEntityType.title,
            count: 0,
            value: leftEntityTypeId,
          };
        }

        filterDefs.linkedFromType.options[leftEntityTypeId]!.count++;
        filterDefs.linkedFromType.initialValue.add(leftEntityTypeId);

        const linkEntityLabel = generateEntityLabel(entitySubgraph, linkEntity);
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
          const { propertyType } = getPropertyTypeForEntity(
            entitySubgraph,
            linkEntityTypeId,
            propertyBaseUrl,
          );
          linkEntityProperties[propertyType.title] =
            stringifyPropertyValue(propertyValue);
        }

        const sourceEntityProperties: IncomingLinkRow["sourceEntityProperties"] =
          {};
        for (const [propertyBaseUrl, propertyValue] of typedEntries(
          leftEntity.properties,
        )) {
          const { propertyType } = getPropertyTypeForEntity(
            entitySubgraph,
            leftEntityTypeId,
            propertyBaseUrl,
          );
          sourceEntityProperties[propertyType.title] =
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
            sourceEntity: leftEntity,
            sourceEntityLabel: leftEntityLabel,
            sourceEntityProperties,
            sourceEntityType: leftEntityType,
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
    }, [customColumns, entitySubgraph, incomingLinksAndSources, onEntityClick]);

    const [filterValues, setFilterValues] = useVirtualizedTableFilterState({
      defaultFilterValues: initialFilterValues,
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
                case "linkedFromType": {
                  if (
                    !isValueIncludedInFilter({
                      currentValue,
                      valueToCheck: row.data.sourceEntity.metadata.entityTypeId,
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
              case "linkedFromType": {
                return (
                  a.data.sourceEntityType.title.localeCompare(
                    b.data.sourceEntityType.title,
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
          }),
      [filterValues, sort, unsortedRows],
    );

    const height = Math.min(
      maxLinksTableHeight,
      rows.length * linksTableRowHeight + virtualizedTableHeaderHeight + 2,
    );

    const columns = useMemo(() => {
      const applicableCustomColumns = customColumns?.filter(
        (column) =>
          typeof filterValues.linkType === "object" &&
          filterValues.linkType.has(column.appliesToEntityTypeId),
      );

      return createColumns(applicableCustomColumns ?? []);
    }, [filterValues, customColumns]);

    return (
      <Box sx={{ height }}>
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
