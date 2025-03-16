import type {
  EntityId,
  PartialEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { EntityOrTypeIcon } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Entity } from "@local/hash-graph-sdk/entity";
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
import type { LinkEntityAndRightEntity } from "@local/hash-subgraph";
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

import { ClickableCellChip } from "../../../../clickable-cell-chip";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "../../../../virtualized-table";
import { VirtualizedTable } from "../../../../virtualized-table";
import { virtualizedTableHeaderHeight } from "../../../../virtualized-table/header";
import type {
  VirtualizedTableFilterDefinition,
  VirtualizedTableFilterDefinitionsByFieldId,
  VirtualizedTableFilterValue,
  VirtualizedTableFilterValuesByFieldId,
} from "../../../../virtualized-table/header/filter";
import { isValueIncludedInFilter } from "../../../../virtualized-table/header/filter";
import type { VirtualizedTableSort } from "../../../../virtualized-table/header/sort";
import { useVirtualizedTableFilterState } from "../../../../virtualized-table/use-filter-state";
import { useEntityEditor } from "../../entity-editor-context";
import type { CustomEntityLinksColumn } from "../../shared/types";
import { PropertiesTooltip } from "../shared/properties-tooltip";
import {
  linksTableCellSx,
  linksTableFontSize,
  linksTableRowHeight,
  maxLinksTableHeight,
} from "../shared/table-styling";

type OutgoingLinksFieldId = "linkTypes" | "linkedTo" | "linkedToTypes" | "link";

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
      closedMultiEntityTypesDefinitions,
      closedMultiEntityTypesMap,
      entitySubgraph,
      customEntityLinksColumns: customColumns,
      defaultOutgoingLinkFilters,
      onEntityClick,
      onTypeClick,
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
