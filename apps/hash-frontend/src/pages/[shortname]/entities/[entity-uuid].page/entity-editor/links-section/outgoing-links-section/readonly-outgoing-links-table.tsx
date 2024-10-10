import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { LinkEntityAndRightEntity } from "@local/hash-subgraph";
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

const fieldIds = ["linkType", "linkedTo", "linkedToType", "link"] as const;

type FieldId = (typeof fieldIds)[number];

const columns: VirtualizedTableColumn<FieldId>[] = [
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
    width: 120,
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
    width: 120,
  },
];

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
};

const TableRow = memo(({ row }: { row: OutgoingLinkRow }) => {
  return (
    <>
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
        <Tooltip
          title={
            Object.keys(row.targetEntityProperties).length > 0 ? (
              <PropertiesTooltipContent
                properties={row.targetEntityProperties}
              />
            ) : (
              "This target entity has no properties"
            )
          }
        >
          <Box
            component="button"
            onClick={() =>
              row.onEntityClick(row.targetEntity.metadata.recordId.entityId)
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
              {row.targetEntityLabel}
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
          {row.targetEntityType.title}
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
  OutgoingLinkRow,
  FieldId
> = (_index, row) => <TableRow row={row.data} />;

type OutgoingLinksTableProps = {
  outgoingLinksAndTargets: LinkEntityAndRightEntity[];
};

export const OutgoingLinksTable = memo(
  ({ outgoingLinksAndTargets }: OutgoingLinksTableProps) => {
    const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
      fieldId: "linkedTo",
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
      } as const satisfies VirtualizedTableFilterDefinitionsByFieldId<FieldId>;

      const entityTypesByVersionedUrl: Record<VersionedUrl, EntityType> = {};

      for (const {
        rightEntity: rightEntityRevisions,
        linkEntity: linkEntityRevisions,
      } of outgoingLinksAndTargets) {
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

        const rightEntity = rightEntityRevisions[0];
        if (!rightEntity) {
          throw new Error("Expected at least one left entity revision");
        }

        const rightEntityLabel = generateEntityLabel(
          entitySubgraph,
          rightEntity,
        );
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
                FieldId,
                VirtualizedTableFilterValue,
              ],
          ),
        ) as VirtualizedTableFilterValuesByFieldId<FieldId>,
        unsortedRows: rowData,
      };
    }, [entitySubgraph, outgoingLinksAndTargets, onEntityClick]);

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
