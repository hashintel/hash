import type { PropertyType, VersionedUrl } from "@blockprotocol/type-system";
import type { EntityType } from "@blockprotocol/type-system/slim";
import { IconButton } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { ValueMetadata } from "@local/hash-graph-client/api";
import { Entity } from "@local/hash-graph-sdk/entity";
import type {
  EntityId,
  EntityMetadata,
  EntityRecordId,
  PropertyMetadataObject,
  PropertyObject,
  PropertyValue,
} from "@local/hash-graph-types/entity";
import type { PropertyTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { PersistedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPropertyTypesForEntityType,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import type { SxProps, Theme } from "@mui/material";
import { Box, Stack, TableCell, Typography } from "@mui/material";
import { memo, useMemo, useRef, useState } from "react";

import { CircleInfoIcon } from "../../../../../shared/icons/circle-info-icon";
import { ValueChip } from "../../../../shared/value-chip";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "../../../../shared/virtualized-table";
import {
  defaultCellSx,
  VirtualizedTable,
} from "../../../../shared/virtualized-table";
import type {
  VirtualizedTableFilter,
  VirtualizedTableFiltersByFieldId,
} from "../../../../shared/virtualized-table/header/filter";
import {
  isFilterValueIncluded,
  missingValueString,
} from "../../../../shared/virtualized-table/header/filter";
import type { VirtualizedTableSort } from "../../../../shared/virtualized-table/header/sort";
import type { ProposedEntityOutput } from "../shared/types";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";
import { SourcesPopover } from "./shared/sources-popover";

const fixedFieldIds = ["status", "entityTypeId", "entityLabel"] as const;

type FixedFieldId = (typeof fixedFieldIds)[number];

const isFixedField = (fieldId: string): fieldId is FixedFieldId =>
  fixedFieldIds.includes(fieldId as FixedFieldId);

/**
 * The columns are either the fixed fields or properties of the type(s) in the table
 */
type FieldId = FixedFieldId | VersionedUrl;

type EntityColumnMetadata = { appliesToEntityTypeIds: VersionedUrl[] };

const generateColumns = (
  entityTypes: EntityType[],
  subgraph?: Subgraph,
): VirtualizedTableColumn<FieldId, EntityColumnMetadata>[] => {
  const propertyTypesByVersionedUrl: Record<
    VersionedUrl,
    PropertyType & { appliesToEntityTypeIds: VersionedUrl[] }
  > = {};

  if (subgraph) {
    for (const entityType of entityTypes) {
      const entityPropertyTypes = getPropertyTypesForEntityType(
        entityType,
        subgraph,
      ).values();

      for (const { schema } of entityPropertyTypes) {
        propertyTypesByVersionedUrl[schema.$id] ??= {
          ...schema,
          appliesToEntityTypeIds: [],
        };

        propertyTypesByVersionedUrl[schema.$id]!.appliesToEntityTypeIds.push(
          entityType.$id,
        );
      }
    }
  }

  return [
    {
      label: "Status",
      id: "status",
      sortable: true,
      width: 100,
    },
    {
      label: "Type",
      id: "entityTypeId",
      sortable: true,
      width: 120,
    },
    {
      label: "Label",
      id: "entityLabel",
      sortable: true,
      width: 140,
    },
    ...Object.values(propertyTypesByVersionedUrl)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((property) => ({
        label: property.title,
        id: property.$id,
        sortable: true,
        width: "auto",
        metadata: { appliesToEntityTypeIds: property.appliesToEntityTypeIds },
      })),
  ];
};

type EntityResultRow = {
  entityLabel: string;
  entityTypeId: VersionedUrl;
  entityType: EntityType;
  proposedEntityId?: EntityId;
  onEntityClick: (entityId: EntityId) => void;
  onEntityTypeClick: (entityTypeId: VersionedUrl) => void;
  persistedEntity?: Entity;
  properties: PropertyObject;
  propertiesMetadata: PropertyMetadataObject;
  researchOngoing: boolean;
  status: "Proposed" | "Created" | "Updated";
};

const typographySx = {
  color: ({ palette }) => palette.common.black,
  fontSize: 12,
  fontWeight: 500,
} as const satisfies SxProps<Theme>;

const cellSx = {
  ...defaultCellSx,
  ...typographySx,
  background: "white",
  "&:not(:last-child)": {
    borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
  },
} as const satisfies SxProps<Theme>;

const PropertyValueCell = ({
  metadata,
  value,
}: {
  metadata?: ValueMetadata;
  value: PropertyValue;
}) => {
  const [showMetadataTooltip, setShowMetadataTooltip] = useState(false);

  const stringifiedValue = stringifyPropertyValue(value);
  const cellRef = useRef<HTMLDivElement>(null);

  const buttonId = generateUuid();

  return (
    <TableCell sx={{ ...cellSx, maxWidth: 700 }} ref={cellRef}>
      <Stack direction="row" alignItems="center">
        <Typography
          sx={{
            ...typographySx,
            lineHeight: 1,
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {stringifiedValue}
        </Typography>
        <IconButton
          aria-describedby={buttonId}
          onClick={() => setShowMetadataTooltip(true)}
          sx={{ ml: 1 }}
        >
          <CircleInfoIcon
            sx={{
              fontSize: 12,
              fill: ({ palette }) => palette.gray[40],
            }}
          />
        </IconButton>
      </Stack>
      <SourcesPopover
        buttonId={buttonId}
        open={showMetadataTooltip}
        cellRef={cellRef}
        onClose={() => setShowMetadataTooltip(false)}
        sources={metadata?.provenance?.sources ?? []}
      />
    </TableCell>
  );
};

const TableRow = memo(
  ({
    columns,
    row,
  }: {
    columns: VirtualizedTableColumn<FieldId, EntityColumnMetadata>[];
    row: EntityResultRow;
  }) => {
    const entityTypeTitle = row.entityType.title;

    return (
      <>
        <TableCell sx={{ ...cellSx, position: "sticky", left: 0, zIndex: 1 }}>
          {row.status}
        </TableCell>
        <TableCell
          sx={{
            ...cellSx,
            position: "sticky",
            zIndex: 1,
            left: columns[0]!.width,
            px: 0.5,
          }}
        >
          <Box
            component="button"
            onClick={() => row.onEntityTypeClick(row.entityTypeId)}
            sx={{ background: "none", border: "none", p: 0 }}
          >
            <ValueChip
              type
              sx={{
                cursor: "pointer",
                ml: 1,
                ...typographySx,
              }}
            >
              {entityTypeTitle}
            </ValueChip>
          </Box>
        </TableCell>
        <TableCell
          sx={{
            ...cellSx,
            position: "sticky",
            left: (columns[0]!.width as number) + (columns[1]!.width as number),
            zIndex: 1,
          }}
        >
          <Box
            component="button"
            onClick={() =>
              row.onEntityClick(
                row.persistedEntity
                  ? row.persistedEntity.metadata.recordId.entityId
                  : row.proposedEntityId!,
              )
            }
            sx={{
              background: "none",
              border: "none",
              cursor: "pointer",

              p: 0,
              textAlign: "left",
            }}
          >
            <ValueChip
              sx={{
                ...typographySx,
                color: ({ palette }) => palette.blue[70],
              }}
            >
              {row.entityLabel}
            </ValueChip>
          </Box>
        </TableCell>
        {columns.slice(fixedFieldIds.length).map((column) => {
          const appliesToEntity = column.metadata?.appliesToEntityTypeIds.some(
            (id) => id === row.entityTypeId,
          );

          if (!appliesToEntity) {
            return (
              <TableCell
                sx={({ palette }) => ({
                  ...cellSx,
                  background: palette.gray[5],
                  color: palette.gray[50],
                })}
                key={column.id}
              >
                Does not apply
              </TableCell>
            );
          }

          const propertyValue =
            row.properties[extractBaseUrl(column.id as VersionedUrl)];

          if (propertyValue === undefined || propertyValue === "") {
            if (row.researchOngoing) {
              return (
                <TableCell
                  key={column.id}
                  sx={({ palette }) => ({
                    ...cellSx,
                    background: palette.blue[15],
                    color: palette.blue[70],
                  })}
                >
                  <Stack direction="row" alignItems="center">
                    <Box
                      sx={{
                        background: ({ palette }) => palette.blue[70],
                        height: 6,
                        width: 6,
                        borderRadius: "50%",
                        mr: 1,
                      }}
                    />
                    Researching...
                  </Stack>
                </TableCell>
              );
            }
            return (
              <TableCell
                key={column.id}
                sx={{ ...cellSx, color: ({ palette }) => palette.gray[50] }}
              >
                –
              </TableCell>
            );
          }

          const metadata =
            row.propertiesMetadata.value[
              extractBaseUrl(column.id as VersionedUrl)
            ]?.metadata;

          return (
            <PropertyValueCell
              key={column.id}
              metadata={metadata}
              value={propertyValue}
            />
          );
        })}
      </>
    );
  },
);

const createRowContent: CreateVirtualizedRowContentFn<
  EntityResultRow,
  FieldId,
  EntityColumnMetadata
> = (_index, row, context) => (
  <TableRow columns={context.columns} row={row.data} />
);

type EntityResultTableProps = {
  onEntityClick: (entityId: EntityId) => void;
  onEntityTypeClick: (entityTypeId: VersionedUrl) => void;
  persistedEntities: PersistedEntity[];
  persistedEntitiesSubgraph?: Subgraph<EntityRootType>;
  proposedEntities: ProposedEntityOutput[];
  proposedEntitiesTypesSubgraph?: Subgraph;
};

export const EntityResultTable = memo(
  ({
    onEntityClick,
    onEntityTypeClick,
    persistedEntities,
    persistedEntitiesSubgraph,
    proposedEntities,
    proposedEntitiesTypesSubgraph,
  }: EntityResultTableProps) => {
    const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
      fieldId: "entityLabel",
      direction: "asc",
    });

    const hasData = !!(persistedEntities.length || proposedEntities.length);

    const {
      filters: initialFilters,
      unsortedRows,
      entityTypes,
    }: {
      filters: VirtualizedTableFiltersByFieldId<FieldId>;
      unsortedRows: VirtualizedTableRow<EntityResultRow>[];
      entityTypes: EntityType[];
    } = useMemo(() => {
      const rowData: VirtualizedTableRow<EntityResultRow>[] = [];
      const entityTypesById: Record<
        VersionedUrl,
        { entityType: EntityType; propertyTypes: PropertyTypeWithMetadata[] }
      > = {};

      const startingFilters = {
        status: {
          header: "Status",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilter["options"],
          type: "checkboxes",
          value: new Set<string>(),
        },
        entityTypeId: {
          header: "Type",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilter["options"],
          type: "checkboxes",
          value: new Set<string>(),
        },
        entityLabel: {
          header: "Label",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilter["options"],
          type: "checkboxes",
          value: new Set<string>(),
        },
      } satisfies VirtualizedTableFiltersByFieldId<FieldId>;

      for (const record of persistedEntities.length
        ? persistedEntities
        : proposedEntities) {
        const isProposed = "localEntityId" in record;

        const entity = isProposed
          ? record
          : record.entity
            ? new Entity(record.entity)
            : undefined;

        if (!entity) {
          continue;
        }

        const entityId =
          "localEntityId" in entity
            ? entity.localEntityId
            : entity.metadata.recordId.entityId;

        const entityTypeId =
          "entityTypeId" in entity
            ? entity.entityTypeId
            : entity.metadata.entityTypeId;

        const entityLabel = generateEntityLabel(
          persistedEntitiesSubgraph ?? null,
          {
            properties: entity.properties,
            metadata: {
              recordId: {
                editionId: "irrelevant-here",
                entityId: `ownedBy~${entityId}` as EntityId,
              } satisfies EntityRecordId,
              entityTypeId: entityTypeId satisfies VersionedUrl,
            } as EntityMetadata,
          },
        );

        const subgraph = isProposed
          ? proposedEntitiesTypesSubgraph
          : persistedEntitiesSubgraph;

        if (!subgraph) {
          continue;
        }

        let entityType = entityTypesById[entityTypeId]?.entityType;
        if (!entityType) {
          const entityTypeWithMetadata = getEntityTypeById(
            subgraph,
            entityTypeId,
          );

          if (!entityTypeWithMetadata) {
            // The data for the types may not arrive at the same time as the proposal
            continue;
          }

          entityType = entityTypeWithMetadata.schema;

          entityTypesById[entityTypeId] = {
            entityType,
            propertyTypes: [
              ...getPropertyTypesForEntityType(entityType, subgraph).values(),
            ],
          };
        }

        const status = isProposed
          ? "Proposed"
          : record.operation === "update"
            ? "Updated"
            : "Created";

        /**
         * Account for the entity's values in the filters
         */
        startingFilters.status.options[status] ??= {
          label: status,
          count: 0,
          value: status,
        };
        startingFilters.status.options[status].count++;
        startingFilters.status.initialValue.add(status);
        startingFilters.status.value.add(status);

        startingFilters.entityTypeId.options[entityTypeId] ??= {
          label: entityType.title,
          count: 0,
          value: entityTypeId,
        };
        startingFilters.entityTypeId.options[entityTypeId].count++;
        startingFilters.entityTypeId.initialValue.add(entityTypeId);
        startingFilters.entityTypeId.value.add(entityTypeId);

        startingFilters.entityLabel.options[entityLabel] ??= {
          label: entityLabel,
          count: 0,
          value: entityLabel,
        };
        startingFilters.entityLabel.options[entityLabel].count++;
        startingFilters.entityLabel.initialValue.add(entityLabel);
        startingFilters.entityLabel.value.add(entityLabel);

        for (const propertyType of entityTypesById[entityTypeId]!
          .propertyTypes) {
          const propertyTypeId = propertyType.schema
            .$id as keyof typeof startingFilters;

          const baseUrl = extractBaseUrl(propertyTypeId as VersionedUrl);

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          startingFilters[propertyTypeId] ??= {
            header: propertyType.schema.title,
            initialValue: new Set<string>(),
            options: {},
            type: "checkboxes",
            value: new Set<string>(),
          };

          const value =
            entity.properties[baseUrl] === undefined
              ? null
              : stringifyPropertyValue(entity.properties[baseUrl]);

          const optionsKey = value ?? missingValueString;

          startingFilters[propertyTypeId].options[optionsKey] ??= {
            label: value ?? "Missing",
            count: 0,
            value,
          };

          startingFilters[propertyTypeId].options[optionsKey].count++;
          startingFilters[propertyTypeId].initialValue.add(value as string);
          startingFilters[propertyTypeId].value.add(value as string);
        }

        rowData.push({
          id: entityId,
          data: {
            entityLabel,
            entityTypeId,
            entityType,
            onEntityClick,
            onEntityTypeClick,
            persistedEntity: "metadata" in entity ? entity : undefined,
            proposedEntityId: isProposed ? entityId : undefined,
            properties: entity.properties,
            propertiesMetadata:
              "propertiesMetadata" in entity
                ? entity.propertiesMetadata
                : entity.propertyMetadata,
            researchOngoing:
              "researchOngoing" in record && record.researchOngoing,
            status,
          },
        });
      }

      return {
        entityTypes: Object.values(entityTypesById).map(
          (record) => record.entityType,
        ),
        filters: startingFilters,
        unsortedRows: rowData,
      };
    }, [
      onEntityClick,
      onEntityTypeClick,
      persistedEntities,
      persistedEntitiesSubgraph,
      proposedEntities,
      proposedEntitiesTypesSubgraph,
    ]);

    const [filters, setFilters] =
      useState<VirtualizedTableFiltersByFieldId<FieldId>>(initialFilters);

    const rows = useMemo(
      () =>
        unsortedRows
          .filter((row) => {
            for (const [fieldId, filter] of typedEntries(filters)) {
              if (isFixedField(fieldId)) {
                if (!isFilterValueIncluded(row.data[fieldId], filter)) {
                  return false;
                }
              } else {
                const baseUrl = extractBaseUrl(fieldId);
                const propertyValue = row.data.properties[baseUrl];

                const value =
                  propertyValue === undefined
                    ? null
                    : stringifyPropertyValue(row.data.properties[baseUrl]);

                if (!isFilterValueIncluded(value, filter)) {
                  return false;
                }
              }
            }

            return true;
          })
          .sort((a, b) => {
            const field = sort.fieldId;
            const direction = sort.direction === "asc" ? 1 : -1;

            if (!isFixedField(field)) {
              /**
               * This is a property field, so we need to compare the values of the properties
               */
              const baseUrl = extractBaseUrl(field);

              return (
                (a.data.properties[baseUrl]
                  ?.toString()
                  .localeCompare(
                    b.data.properties[baseUrl]?.toString() ?? "",
                  ) ?? 0) * direction
              );
            }

            return a.data[field].localeCompare(b.data[field]) * direction;
          }),
      [filters, sort, unsortedRows],
    );

    const columns = useMemo(
      () =>
        generateColumns(
          entityTypes,
          persistedEntities.length === 0
            ? proposedEntitiesTypesSubgraph
            : persistedEntitiesSubgraph,
        ),
      [
        entityTypes,
        proposedEntitiesTypesSubgraph,
        persistedEntitiesSubgraph,
        persistedEntities.length,
      ],
    );

    return (
      <OutputContainer
        noBorder={hasData}
        sx={{
          flex: 1,
          minWidth: 400,
          "& table": {
            tableLayout: "auto",
          },
          "& th:not(:last-child)": {
            borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
          },
        }}
      >
        {hasData ? (
          <VirtualizedTable
            columns={columns}
            createRowContent={createRowContent}
            filters={filters}
            setFilters={setFilters}
            fixedColumns={3}
            rows={rows}
            sort={sort}
            setSort={setSort}
          />
        ) : (
          <EmptyOutputBox
            Icon={outputIcons.table}
            label="Entities proposed and affected by this flow will appear in a table here"
          />
        )}
      </OutputContainer>
    );
  },
);
