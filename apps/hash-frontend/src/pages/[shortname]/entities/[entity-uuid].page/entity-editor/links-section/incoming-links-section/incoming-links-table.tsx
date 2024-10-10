import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { LinkEntityAndLeftEntity } from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPropertyTypeForEntity,
} from "@local/hash-subgraph/stdlib";
import { Box, TableCell, Tooltip } from "@mui/material";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

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
import { PropertiesTooltipContent } from "../shared/properties-tooltip-content";
import {
  linksTableCellSx,
  linksTableFontSize,
  linksTableRowHeight,
  maxLinksTableHeight,
} from "../shared/table-styling";

const fieldIds = ["linkedFrom", "linkType", "linkedFromType", "link"] as const;

type FieldId = (typeof fieldIds)[number];

const columns: VirtualizedTableColumn<FieldId>[] = [
  {
    label: "Linked from",
    id: "linkedFrom",
    sortable: true,
    width: 120,
  },
  {
    label: "Link type",
    id: "linkType",
    sortable: true,
    width: 120,
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
};

const TableRow = memo(({ row }: { row: IncomingLinkRow }) => {
  return (
    <>
      <TableCell sx={linksTableCellSx}>
        <Tooltip
          title={
            Object.keys(row.sourceEntityProperties).length > 0 ? (
              <PropertiesTooltipContent
                properties={row.sourceEntityProperties}
              />
            ) : (
              "This target entity has no properties"
            )
          }
        >
          <Box
            component="button"
            onClick={() =>
              row.onEntityClick(row.sourceEntity.metadata.recordId.entityId)
            }
            sx={{
              background: "none",
              border: "none",
              cursor: "pointer",
              maxWidth: "100%",
              p: 0,
              textAlign: "left",
            }}
          >
            <ValueChip
              sx={{
                color: ({ palette }) => palette.blue[70],
                fontSize: linksTableFontSize,
              }}
            >
              {row.sourceEntityLabel}
            </ValueChip>
          </Box>
        </Tooltip>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <ValueChip
          type
          sx={{
            cursor: "pointer",
            fontSize: linksTableFontSize,
          }}
        >
          {row.linkEntityType.title}
        </ValueChip>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <ValueChip
          type
          sx={{
            cursor: "pointer",
            fontSize: linksTableFontSize,
          }}
        >
          {row.sourceEntityType.title}
        </ValueChip>
      </TableCell>
      <TableCell sx={linksTableCellSx}>
        <Tooltip
          title={
            Object.keys(row.linkEntityProperties).length > 0 ? (
              <PropertiesTooltipContent properties={row.linkEntityProperties} />
            ) : (
              "This link entity has no properties"
            )
          }
        >
          <Box
            component="button"
            onClick={() => row.onEntityClick(row.linkEntity.entityId)}
            sx={{
              background: "none",
              border: "none",
              cursor: "pointer",
              maxWidth: "100%",
              p: 0,
              textAlign: "left",
            }}
          >
            <ValueChip
              sx={{
                color: ({ palette }) => palette.blue[70],
                fontSize: linksTableFontSize,
              }}
            >
              {row.linkEntityLabel}
            </ValueChip>
          </Box>
        </Tooltip>
      </TableCell>
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

    const { entitySubgraph, onEntityClick } = useEntityEditor();

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

        const leftEntityLabel = generateEntityLabel(entitySubgraph, leftEntity);
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
    }, [entitySubgraph, incomingLinksAndSources, onEntityClick]);

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
              default:
                throw new Error(`Unexpected fieldId: ${field}`);
            }
          }),
      [filterValues, sort, unsortedRows],
    );

    const height = Math.min(
      maxLinksTableHeight,
      rows.length * linksTableRowHeight + virtualizedTableHeaderHeight + 2,
    );

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
