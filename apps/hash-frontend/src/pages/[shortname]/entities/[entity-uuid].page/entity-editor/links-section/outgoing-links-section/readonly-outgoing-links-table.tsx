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
import { Box, Stack, TableCell, Typography } from "@mui/material";
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

const fieldIds = ["linkTypes", "linkedTo", "linkedToTypes", "link"] as const;

type OutgoingLinksFieldId = (typeof fieldIds)[number];

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
  targetEntityTypes: EntityType[];
  linkEntity: Entity;
  linkEntityLabel: string;
  linkEntityProperties: { [propertyTitle: string]: string };
  linkEntityTypes: EntityType[];
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
        <Stack direction="row" alignItems="center" gap={1}>
          {row.linkEntityTypes.map((linkEntityType) => (
            <ValueChip
              key={linkEntityType.$id}
              showInFull
              type
              sx={{
                fontSize: linksTableFontSize,
              }}
            >
              {linkEntityType.title}
            </ValueChip>
          ))}
        </Stack>
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
        <Stack direction="row" gap={1}>
          {row.targetEntityTypes.map((targetEntityType) => (
            <ValueChip
              key={targetEntityType.$id}
              type
              sx={{
                fontSize: linksTableFontSize,
              }}
            >
              {targetEntityType.title}
            </ValueChip>
          ))}
        </Stack>
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

        const linkEntityTypeIds = linkEntity.metadata.entityTypeIds;
        const linkEntityTypes: EntityType[] = [];

        for (const linkEntityTypeId of linkEntityTypeIds) {
          let linkEntityType = entityTypesByVersionedUrl[linkEntityTypeId];

          if (!linkEntityType) {
            const foundType = getEntityTypeById(
              entitySubgraph,
              linkEntityTypeId,
            );

            if (!foundType) {
              throw new Error(
                `Could not find linkEntityType with id ${linkEntityTypeId} in subgraph`,
              );
            }

            linkEntityType = foundType.schema;
            linkEntityTypes.push(linkEntityType);

            filterDefs.linkTypes.options[linkEntityTypeId] ??= {
              label: linkEntityType.title,
              count: 0,
              value: linkEntityTypeId,
            };
          }

          filterDefs.linkTypes.options[linkEntityTypeId]!.count++;
          filterDefs.linkTypes.initialValue.add(linkEntityTypeId);
        }

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

        const rightEntityTypeIds = rightEntity.metadata.entityTypeIds;
        const rightEntityTypes: EntityType[] = [];

        for (const rightEntityTypeId of rightEntityTypeIds) {
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
            rightEntityTypes.push(rightEntityType);

            filterDefs.linkedToTypes.options[rightEntityTypeId] ??= {
              label: rightEntityType.title,
              count: 0,
              value: rightEntityTypeId,
            };
          }

          filterDefs.linkedToTypes.options[rightEntityTypeId]!.count++;
          filterDefs.linkedToTypes.initialValue.add(rightEntityTypeId);
        }

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
            linkEntityTypeIds,
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
            rightEntityTypeIds,
            propertyBaseUrl,
          );
          targetEntityProperties[propertyType.title] =
            stringifyPropertyValue(propertyValue);
        }

        rowData.push({
          id: linkEntity.metadata.recordId.entityId,
          data: {
            customFields,
            linkEntityTypes,
            linkEntity,
            linkEntityLabel,
            linkEntityProperties,
            onEntityClick,
            targetEntity: rightEntity,
            targetEntityLabel: rightEntityLabel,
            targetEntityProperties,
            targetEntityTypes: rightEntityTypes,
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
                      valueToCheck:
                        row.data.targetEntity.metadata.entityTypeIds,
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
          typeof filterValues.linkTypes === "object" &&
          filterValues.linkTypes.has(column.appliesToEntityTypeId),
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
