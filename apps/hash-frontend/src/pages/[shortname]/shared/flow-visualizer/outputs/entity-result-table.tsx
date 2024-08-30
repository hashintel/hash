import type { PropertyType, VersionedUrl } from "@blockprotocol/type-system";
import type { EntityType } from "@blockprotocol/type-system/slim";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { Entity } from "@local/hash-graph-sdk/entity";
import type {
  EntityId,
  EntityMetadata,
  EntityProperties,
  EntityRecordId,
  PropertyMetadataObject,
  PropertyObject,
} from "@local/hash-graph-types/entity";
import type {
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { PersistedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPossibleLinkTypesForEntityType,
  getPropertyTypesForEntityType,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, TableCell } from "@mui/material";
import { memo, useMemo, useState } from "react";

import { ValueChip } from "../../../../shared/value-chip";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "../../../../shared/virtualized-table";
import { VirtualizedTable } from "../../../../shared/virtualized-table";
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
import {
  cellSx,
  LinkedEntitiesCell,
  NoValueCell,
  PropertyValueCell,
  typographySx,
} from "./entity-result-table/cells";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";

const fixedFieldIds = ["status", "entityTypeId", "entityLabel"] as const;

type FixedFieldId = (typeof fixedFieldIds)[number];

const isFixedField = (fieldId: string): fieldId is FixedFieldId =>
  fixedFieldIds.includes(fieldId as FixedFieldId);

/**
 * The columns are either the fixed fields or attributes of the type(s) in the table,
 * whether properties or links to other entities.
 */
type FieldId = FixedFieldId | VersionedUrl;

type EntityColumnMetadata = { appliesToEntityTypeIds: VersionedUrl[] };

type EntityTypeWithDependenciesByEntityTypeId = Record<
  VersionedUrl,
  {
    entityType: EntityType;
    propertyTypes: PropertyTypeWithMetadata[];
    linkTypes: EntityTypeWithMetadata[];
  }
>;

/**
 * Generate the columns for the table.
 *
 * This has to be dynamic as the properties and link columns will depend on the types of entities discovered.
 * For each, we also need to know which properties and links apply to which types of entities.
 */
const generateColumns = (
  entityTypesRecord: EntityTypeWithDependenciesByEntityTypeId,
  subgraph?: Subgraph,
): VirtualizedTableColumn<FieldId, EntityColumnMetadata>[] => {
  const propertyTypesByVersionedUrl: Record<
    VersionedUrl,
    PropertyType & { appliesToEntityTypeIds: VersionedUrl[] }
  > = {};

  const linkEntityTypesByVersionedUrl: Record<
    VersionedUrl,
    EntityType & { appliesToEntityTypeIds: VersionedUrl[] }
  > = {};

  if (subgraph) {
    for (const { entityType, propertyTypes, linkTypes } of Object.values(
      entityTypesRecord,
    )) {
      for (const { schema } of propertyTypes) {
        propertyTypesByVersionedUrl[schema.$id] ??= {
          ...schema,
          appliesToEntityTypeIds: [],
        };

        propertyTypesByVersionedUrl[schema.$id]!.appliesToEntityTypeIds.push(
          entityType.$id,
        );
      }

      for (const { schema } of linkTypes) {
        linkEntityTypesByVersionedUrl[schema.$id] ??= {
          ...schema,
          appliesToEntityTypeIds: [],
        };

        linkEntityTypesByVersionedUrl[schema.$id]!.appliesToEntityTypeIds.push(
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
      label: "Name",
      id: "entityLabel",
      sortable: true,
      width: 140,
    },
    ...Object.values(propertyTypesByVersionedUrl)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((propertyType) => ({
        label: propertyType.title,
        id: propertyType.$id,
        sortable: true,
        width: "auto",
        metadata: {
          appliesToEntityTypeIds: propertyType.appliesToEntityTypeIds,
        },
      })),
    ...Object.values(linkEntityTypesByVersionedUrl)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((linkType) => ({
        label: linkType.title,
        id: linkType.$id,
        sortable: true,
        width: "auto",
        metadata: { appliesToEntityTypeIds: linkType.appliesToEntityTypeIds },
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
  outgoingLinksByLinkTypeId: Record<
    VersionedUrl,
    {
      linkEntityId: EntityId;
      targetEntityId: EntityId;
      targetEntityLabel: string;
    }[]
  >;
  persistedEntity?: Entity;
  properties: PropertyObject;
  propertiesMetadata: PropertyMetadataObject;
  researchOngoing: boolean;
  status: "Proposed" | "Created" | "Updated";
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

          if (column.id.includes("/entity-type/")) {
            /**
             * This is a link entity type
             */

            const linkedEntities =
              row.outgoingLinksByLinkTypeId[column.id as VersionedUrl];

            if (!linkedEntities?.length) {
              return (
                <NoValueCell
                  columnId={column.id}
                  key={column.id}
                  researchOngoing={row.researchOngoing}
                />
              );
            }

            return (
              <LinkedEntitiesCell
                key={column.id}
                linkedEntities={linkedEntities}
                onEntityClick={row.onEntityClick}
              />
            );
          }

          const propertyValue =
            row.properties[extractBaseUrl(column.id as VersionedUrl)];

          if (propertyValue === undefined || propertyValue === "") {
            return (
              <NoValueCell
                columnId={column.id}
                key={column.id}
                researchOngoing={row.researchOngoing}
              />
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
      entityTypesById,
    }: {
      filters: VirtualizedTableFiltersByFieldId<FieldId>;
      unsortedRows: VirtualizedTableRow<EntityResultRow>[];
      entityTypesById: EntityTypeWithDependenciesByEntityTypeId;
    } = useMemo(() => {
      const rowData: VirtualizedTableRow<EntityResultRow>[] = [];
      const entityTypesRecord: EntityTypeWithDependenciesByEntityTypeId = {};

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
          header: "Name",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilter["options"],
          type: "checkboxes",
          value: new Set<string>(),
        },
      } satisfies VirtualizedTableFiltersByFieldId<FieldId>;

      const entityRecords = persistedEntities.length
        ? persistedEntities
        : proposedEntities;

      /**
       * We use this map to resolve the outgoing links and target entities from each entity.
       */
      const outgoingLinksBySourceEntityId: Record<
        EntityId,
        /**
         * The links and targets of each type of link for the entity.
         */
        {
          [linkEntityTypeId: VersionedUrl]: {
            targetEntityId: EntityId;
            linkEntityId: EntityId;
          }[];
        }
      > = {};

      /**
       * We use this map to look up the target entities for links.
       */
      const entitiesByEntityId: Record<
        EntityId,
        {
          record: ProposedEntityOutput | PersistedEntity;
          entityLabel: string;
          entity: ProposedEntityOutput | Entity<EntityProperties>;
        }
      > = {};

      /**
       * This first loop is just to build our maps above.
       *
       * We need a second pass to build each entity's data,
       * to avoid having to search through the whole array for links and targets when we populate each entity's row
       * data.
       */
      for (const record of entityRecords) {
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

        const linkData =
          "linkData" in entity && !!entity.linkData
            ? {
                linkEntityTypeId: entity.metadata.entityTypeId,
                sourceEntityId: entity.linkData.leftEntityId,
                targetEntityId: entity.linkData.rightEntityId,
              }
            : "sourceEntityId" in entity &&
                entity.sourceEntityId &&
                "targetEntityId" in entity &&
                entity.targetEntityId
              ? {
                  linkEntityTypeId: entity.entityTypeId,
                  sourceEntityId:
                    entity.sourceEntityId.kind === "proposed-entity"
                      ? entity.sourceEntityId.localId
                      : entity.sourceEntityId.entityId,
                  targetEntityId:
                    entity.targetEntityId.kind === "proposed-entity"
                      ? entity.targetEntityId.localId
                      : entity.targetEntityId.entityId,
                }
              : undefined;

        if (linkData) {
          const sourceEntityId = linkData.sourceEntityId;

          outgoingLinksBySourceEntityId[sourceEntityId] ??= {};
          outgoingLinksBySourceEntityId[sourceEntityId][
            linkData.linkEntityTypeId
          ] ??= [];
          outgoingLinksBySourceEntityId[sourceEntityId][
            linkData.linkEntityTypeId
          ]!.push({
            targetEntityId: linkData.targetEntityId,
            linkEntityId: entityId,
          });

          /**
           * We show linked entities as chips in the source entity's row, so we don't want to include them in our
           * entities map.
           *
           * We also currently don't support in the UI links which links to other links.
           */
          continue;
        }

        const entityLabel = generateEntityLabel(
          persistedEntitiesSubgraph ?? proposedEntitiesTypesSubgraph ?? null,
          {
            properties: entity.properties,
            metadata: {
              recordId: {
                editionId: "irrelevant-here",
                entityId: `ownedBy~${entityId}` as EntityId,
              } satisfies EntityRecordId,
              entityTypeId:
                "entityTypeId" in entity
                  ? entity.entityTypeId
                  : entity.metadata.entityTypeId,
            } as EntityMetadata,
          },
        );

        entitiesByEntityId[entityId] = { entity, entityLabel, record };
      }

      for (const [entityId, { entity, entityLabel, record }] of typedEntries(
        entitiesByEntityId,
      )) {
        const isProposed = "localEntityId" in record;

        const entityTypeId =
          "entityTypeId" in entity
            ? entity.entityTypeId
            : entity.metadata.entityTypeId;

        const subgraph = isProposed
          ? proposedEntitiesTypesSubgraph
          : persistedEntitiesSubgraph;

        if (!subgraph) {
          continue;
        }

        let entityType = entityTypesRecord[entityTypeId]?.entityType;
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

          entityTypesRecord[entityTypeId] = {
            entityType,
            linkTypes: [
              ...getPossibleLinkTypesForEntityType(
                entityTypeId,
                subgraph,
              ).values(),
            ],
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

        const outgoingLinksByLinkTypeId: EntityResultRow["outgoingLinksByLinkTypeId"] =
          {};

        const outgoingLinks = outgoingLinksBySourceEntityId[entityId];
        if (outgoingLinks) {
          for (const [linkEntityTypeId, linksAndTargets] of typedEntries(
            outgoingLinks,
          )) {
            outgoingLinksByLinkTypeId[linkEntityTypeId] = [];

            for (const { targetEntityId, linkEntityId } of linksAndTargets) {
              const linkedEntityRecord = entitiesByEntityId[targetEntityId];
              if (!linkedEntityRecord) {
                throw new Error(
                  `Could not find entity with id ${targetEntityId} linked from entity with id ${entityId}`,
                );
              }

              outgoingLinksByLinkTypeId[linkEntityTypeId].push({
                targetEntityId,
                targetEntityLabel: linkedEntityRecord.entityLabel,
                linkEntityId,
              });
            }
          }
        }

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

        for (const linkType of entityTypesRecord[entityTypeId]!.linkTypes) {
          const linkTypeId = linkType.schema
            .$id as keyof typeof startingFilters;

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          startingFilters[linkTypeId] ??= {
            header: linkType.schema.title,
            initialValue: new Set<string>(),
            options: {},
            type: "checkboxes",
            value: new Set<string>(),
          };

          const linkedEntities =
            outgoingLinksByLinkTypeId[linkType.schema.$id] ?? [];

          if (linkedEntities.length) {
            /**
             * For each possible link from the entity, account for each target entity
             */
            for (const {
              targetEntityId,
              targetEntityLabel,
            } of linkedEntities) {
              startingFilters[linkTypeId].options[targetEntityId] ??= {
                label: targetEntityLabel,
                count: 0,
                value: targetEntityId,
              };
              startingFilters[linkTypeId].options[targetEntityId].count++;
              startingFilters[linkTypeId].initialValue.add(targetEntityId);
              startingFilters[linkTypeId].value.add(targetEntityId);
            }
          } else {
            /**
             * If we have no targets for this link, we need to add the 'None' filter and increase its count.
             */
            startingFilters[linkTypeId].options[missingValueString] ??= {
              label: "None",
              count: 0,
              value: null,
            };
            startingFilters[linkTypeId].options[missingValueString]!.count++;
            startingFilters[linkTypeId].initialValue.add(
              null as unknown as string,
            );
            startingFilters[linkTypeId].value.add(null as unknown as string);
          }
        }

        for (const propertyType of entityTypesRecord[entityTypeId]!
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
            outgoingLinksByLinkTypeId,
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
        entityTypesById: entityTypesRecord,
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
          entityTypesById,
          persistedEntities.length === 0
            ? proposedEntitiesTypesSubgraph
            : persistedEntitiesSubgraph,
        ),
      [
        entityTypesById,
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
