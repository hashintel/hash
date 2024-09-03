import type { PropertyType, VersionedUrl } from "@blockprotocol/type-system";
import type { EntityType } from "@blockprotocol/type-system/slim";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
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
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ValueChip } from "../../../../shared/value-chip";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "../../../../shared/virtualized-table";
import { VirtualizedTable } from "../../../../shared/virtualized-table";
import type {
  VirtualizedTableFilterDefinition,
  VirtualizedTableFilterDefinitionsByFieldId,
  VirtualizedTableFilterValue,
  VirtualizedTableFilterValuesByFieldId,
} from "../../../../shared/virtualized-table/header/filter";
import {
  isValueIncludedInFilter,
  missingValueString,
} from "../../../../shared/virtualized-table/header/filter";
import type { VirtualizedTableSort } from "../../../../shared/virtualized-table/header/sort";
import { useVirtualizedTableFilterState } from "../../../../shared/virtualized-table/use-filter-state";
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
import { TableSkeleton } from "./shared/table-skeleton";

const fixedFieldIds = [
  "relevance",
  "status",
  "entityTypeId",
  "entityLabel",
] as const;

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
    entitiesCount: number;
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
const generateColumns = ({
  entityTypesRecord,
  hasRelevantEntities,
  subgraph,
}: {
  entityTypesRecord: EntityTypeWithDependenciesByEntityTypeId;
  hasRelevantEntities: boolean;
  subgraph?: Subgraph;
}): VirtualizedTableColumn<FieldId, EntityColumnMetadata>[] => {
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
    ...(hasRelevantEntities
      ? [
          {
            label: "Relevance",
            id: "relevance",
            sortable: true,
            width: 120,
          } as const,
        ]
      : []),
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
  relevance: "Yes" | "No";
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

    const hasRelevanceColumn =
      columns[0]?.id === ("relevance" satisfies FixedFieldId);

    const firstColumnLeftPosition = 0;
    const secondColumnLeftPosition = columns[0]!.width as number;
    const thirdColumnLeftPosition =
      secondColumnLeftPosition + (columns[1]!.width as number);
    const fourthColumnLeftPosition =
      thirdColumnLeftPosition + (columns[2]!.width as number);

    return (
      <>
        {hasRelevanceColumn && (
          <TableCell
            sx={{
              ...cellSx,
              position: "sticky",
              left: firstColumnLeftPosition,
              zIndex: 1,
            }}
          >
            {row.relevance}
          </TableCell>
        )}
        <TableCell
          sx={{
            ...cellSx,
            position: "sticky",
            left: hasRelevanceColumn
              ? secondColumnLeftPosition
              : firstColumnLeftPosition,
            zIndex: 1,
          }}
        >
          {row.status}
        </TableCell>
        <TableCell
          sx={{
            ...cellSx,
            position: "sticky",
            zIndex: 1,
            left: hasRelevanceColumn
              ? thirdColumnLeftPosition
              : secondColumnLeftPosition,
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
            left: hasRelevanceColumn
              ? fourthColumnLeftPosition
              : thirdColumnLeftPosition,
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
        {columns
          .slice(
            hasRelevanceColumn
              ? fixedFieldIds.length
              : fixedFieldIds.length - 1,
          )
          .map((column) => {
            const appliesToEntity =
              column.metadata?.appliesToEntityTypeIds.some(
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
  dataIsLoading: boolean;
  onEntityClick: (entityId: EntityId) => void;
  onEntityTypeClick: (entityTypeId: VersionedUrl) => void;
  persistedEntities: PersistedEntity[];
  persistedEntitiesSubgraph?: Subgraph<EntityRootType>;
  proposedEntities: ProposedEntityOutput[];
  proposedEntitiesTypesSubgraph?: Subgraph;
  relevantEntityIds: EntityId[];
};

export const EntityResultTable = memo(
  ({
    dataIsLoading,
    onEntityClick,
    onEntityTypeClick,
    persistedEntities,
    persistedEntitiesSubgraph,
    proposedEntities,
    proposedEntitiesTypesSubgraph,
    relevantEntityIds,
  }: EntityResultTableProps) => {
    const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
      fieldId: "entityLabel",
      direction: "asc",
    });

    const hasEntities = !!(persistedEntities.length || proposedEntities.length);

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
      entityTypesById,
    }: {
      filterDefinitions: VirtualizedTableFilterDefinitionsByFieldId<FieldId>;
      initialFilterValues: VirtualizedTableFilterValuesByFieldId<FieldId>;
      unsortedRows: VirtualizedTableRow<EntityResultRow>[];
      entityTypesById: EntityTypeWithDependenciesByEntityTypeId;
    } = useMemo(() => {
      const rowData: VirtualizedTableRow<EntityResultRow>[] = [];
      const entityTypesRecord: EntityTypeWithDependenciesByEntityTypeId = {};

      const staticFilterDefs = {
        relevance: {
          header: "Relevance",
          initialValue: "All",
          options: {
            All: {
              count: 0,
              value: "All",
              label: "All",
            },
          } as VirtualizedTableFilterDefinition["options"],
          type: "radio-group",
        },
        status: {
          header: "Status",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilterDefinition["options"],
          type: "checkboxes",
        },
        entityTypeId: {
          header: "Type",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilterDefinition["options"],
          type: "checkboxes",
        },
        entityLabel: {
          header: "Name",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilterDefinition["options"],
          type: "checkboxes",
        },
      } satisfies VirtualizedTableFilterDefinitionsByFieldId<
        Exclude<FieldId, VersionedUrl>
      >;

      const dynamicFilterDefs: VirtualizedTableFilterDefinitionsByFieldId<VersionedUrl> =
        {};

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
            entitiesCount: 0,
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

        entityTypesRecord[entityTypeId]!.entitiesCount++;

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

        const relevance = relevantEntityIds.includes(entityId) ? "Yes" : "No";

        /**
         * Account for the entity's values in the filters
         */
        staticFilterDefs.relevance.options.All!.count++;

        if (relevance === "Yes") {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          staticFilterDefs.relevance.options.Yes ??= {
            label: "Yes",
            count: 0,
            value: "Yes",
          };
          staticFilterDefs.relevance.options.Yes.count++;
        }

        staticFilterDefs.status.options[status] ??= {
          label: status,
          count: 0,
          value: status,
        };
        staticFilterDefs.status.options[status].count++;
        staticFilterDefs.status.initialValue.add(status);

        staticFilterDefs.entityTypeId.options[entityTypeId] ??= {
          label: entityType.title,
          count: 0,
          value: entityTypeId,
        };
        staticFilterDefs.entityTypeId.options[entityTypeId].count++;
        staticFilterDefs.entityTypeId.initialValue.add(entityTypeId);

        staticFilterDefs.entityLabel.options[entityLabel] ??= {
          label: entityLabel,
          count: 0,
          value: entityLabel,
        };
        staticFilterDefs.entityLabel.options[entityLabel].count++;
        staticFilterDefs.entityLabel.initialValue.add(entityLabel);

        for (const linkType of entityTypesRecord[entityTypeId]!.linkTypes) {
          const linkTypeId = linkType.schema.$id;

          dynamicFilterDefs[linkTypeId] ??= {
            header: linkType.schema.title,
            initialValue: new Set<string | null>(),
            options: {},
            type: "checkboxes",
          } as const;

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
              dynamicFilterDefs[linkTypeId].options[targetEntityId] ??= {
                label: targetEntityLabel,
                count: 0,
                value: targetEntityId,
              };
              dynamicFilterDefs[linkTypeId].options[targetEntityId].count++;
              (
                dynamicFilterDefs[linkTypeId].initialValue as Set<string | null>
              ).add(targetEntityId);
            }
          } else {
            /**
             * If we have no targets for this link, we need to add the 'None' filter and increase its count.
             */
            dynamicFilterDefs[linkTypeId].options[missingValueString] ??= {
              label: "None",
              count: 0,
              value: null,
            };
            dynamicFilterDefs[linkTypeId].options[missingValueString]!.count++;
            (
              dynamicFilterDefs[linkTypeId].initialValue as Set<string | null>
            ).add(null);
          }
        }

        for (const propertyType of entityTypesRecord[entityTypeId]!
          .propertyTypes) {
          const propertyTypeId = propertyType.schema.$id;

          const baseUrl = extractBaseUrl(propertyTypeId);

          dynamicFilterDefs[propertyTypeId] ??= {
            header: propertyType.schema.title,
            initialValue: new Set<string>(),
            options: {},
            type: "checkboxes",
          };

          const value =
            entity.properties[baseUrl] === undefined
              ? null
              : stringifyPropertyValue(entity.properties[baseUrl]);

          const optionsKey = value ?? missingValueString;

          dynamicFilterDefs[propertyTypeId].options[optionsKey] ??= {
            label: value ?? "Missing",
            count: 0,
            value,
          };

          dynamicFilterDefs[propertyTypeId].options[optionsKey].count++;
          (
            dynamicFilterDefs[propertyTypeId].initialValue as Set<string | null>
          ).add(value);
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
            relevance,
            researchOngoing:
              "researchOngoing" in record && record.researchOngoing,
            status,
          },
        });
      }

      if (relevantEntityIds.length === 0) {
        // @ts-expect-error -- simple way of omitting this column when necessary
        delete staticFilterDefs.relevance;
      }

      /**
       * For each entity type, we also need to check if a filter has been added for a property or link type which does not apply.
       * If so, we ensure the 'null' value is present, and increment the count of entities for the null value accordingly.
       */
      for (const dynamicDefId of typedKeys(dynamicFilterDefs)) {
        for (const entityType of Object.values(entityTypesRecord)) {
          const doesNotApplyToEntity = dynamicDefId.includes("/entity-type/")
            ? !entityType.linkTypes.some(
                (linkType) => linkType.schema.$id === dynamicDefId,
              )
            : !entityType.propertyTypes.some(
                (propertyType) => propertyType.schema.$id === dynamicDefId,
              );

          if (doesNotApplyToEntity) {
            const optionsKey = missingValueString;

            dynamicFilterDefs[dynamicDefId]!.options[optionsKey] ??= {
              label: "None",
              count: 0,
              value: null,
            };
            dynamicFilterDefs[dynamicDefId]!.options[optionsKey].count +=
              entityType.entitiesCount;
            (
              dynamicFilterDefs[dynamicDefId]!.initialValue as Set<
                string | null
              >
            ).add(null);
          }
        }
      }

      const filterDefs = {
        ...staticFilterDefs,
        ...dynamicFilterDefs,
      };

      return {
        entityTypesById: entityTypesRecord,
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
    }, [
      onEntityClick,
      onEntityTypeClick,
      persistedEntities,
      persistedEntitiesSubgraph,
      proposedEntities,
      proposedEntitiesTypesSubgraph,
      relevantEntityIds,
    ]);

    const [filterValues, setFilterValues] = useVirtualizedTableFilterState({
      defaultFilterValues: initialFilterValues,
      filterDefinitions,
    });

    const rows = useMemo(
      () =>
        unsortedRows
          .filter((row) => {
            for (const [fieldId, currentValue] of typedEntries(filterValues)) {
              if (isFixedField(fieldId)) {
                const valueToCheck = row.data[fieldId];
                if (fieldId === "relevance") {
                  if (currentValue === "Yes" && valueToCheck !== "Yes") {
                    return false;
                  }
                } else if (
                  !isValueIncludedInFilter({
                    valueToCheck,
                    currentValue,
                  })
                ) {
                  return false;
                }
              } else if (fieldId.includes("/entity-type/")) {
                if (typeof currentValue === "string") {
                  throw new Error(
                    `Expected Set for entity type filter, got ${currentValue}`,
                  );
                }

                const linkTargets = row.data.outgoingLinksByLinkTypeId[fieldId];

                if (!linkTargets) {
                  if (!currentValue.has(null as unknown as string)) {
                    /**
                     * This row has no links of this type, and the filter does not include 'null'
                     */
                    return false;
                  }
                } else if (
                  currentValue.isDisjointFrom(
                    new Set(
                      linkTargets.map(({ targetEntityId }) => targetEntityId),
                    ),
                  )
                ) {
                  /**
                   * There are no values in common between the filter and the link targets for this type, for this row
                   */
                  return false;
                }
              } else {
                const baseUrl = extractBaseUrl(fieldId);
                const propertyValue = row.data.properties[baseUrl];

                const value =
                  propertyValue === undefined
                    ? null
                    : stringifyPropertyValue(row.data.properties[baseUrl]);

                if (
                  !isValueIncludedInFilter({
                    valueToCheck: value,
                    currentValue,
                  })
                ) {
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
      [filterValues, sort, unsortedRows],
    );

    const columns = useMemo(
      () =>
        generateColumns({
          entityTypesRecord: entityTypesById,
          hasRelevantEntities: relevantEntityIds.length > 0,
          subgraph:
            persistedEntities.length === 0
              ? proposedEntitiesTypesSubgraph
              : persistedEntitiesSubgraph,
        }),
      [
        entityTypesById,
        proposedEntitiesTypesSubgraph,
        persistedEntitiesSubgraph,
        persistedEntities.length,
        relevantEntityIds.length,
      ],
    );

    return (
      <OutputContainer
        noBorder={hasEntities}
        ref={outputContainerRef}
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
        {hasEntities ? (
          dataIsLoading ? (
            <TableSkeleton
              cellHeight={43}
              tableHeight={outputContainerHeight}
            />
          ) : (
            <VirtualizedTable
              columns={columns}
              createRowContent={createRowContent}
              filterDefinitions={filterDefinitions}
              filterValues={filterValues}
              setFilterValues={setFilterValues}
              fixedColumns={relevantEntityIds.length > 0 ? 4 : 3}
              rows={rows}
              sort={sort}
              setSort={setSort}
            />
          )
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
