import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type {
  ClosedMultiEntityType,
  EntityEditionId,
  EntityId,
  PropertyObject,
  PropertyObjectMetadata,
  PropertyType,
  TypeIdsAndPropertiesForEntity,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { extractBaseUrl, mustHaveAtLeastOne } from "@blockprotocol/type-system";
import type { EntityType } from "@blockprotocol/type-system/slim";
import {
  typedEntries,
  typedKeys,
  typedValues,
} from "@local/advanced-types/typed-entries";
import {
  getClosedMultiEntityTypeFromMap,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import type { GetClosedMultiEntityTypesResponse } from "@local/hash-graph-sdk/entity-type";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";
import type { PersistedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { Box, TableCell } from "@mui/material";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ClickableCellChip } from "../../../../../shared/clickable-cell-chip";
import { useSlideStack } from "../../../../../shared/slide-stack";
import { ValueChip } from "../../../../../shared/value-chip";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "../../../../../shared/virtualized-table";
import { VirtualizedTable } from "../../../../../shared/virtualized-table";
import type {
  VirtualizedTableFilterDefinition,
  VirtualizedTableFilterDefinitionsByFieldId,
  VirtualizedTableFilterValue,
  VirtualizedTableFilterValuesByFieldId,
} from "../../../../../shared/virtualized-table/header/filter";
import {
  isValueIncludedInFilter,
  missingValueString,
} from "../../../../../shared/virtualized-table/header/filter";
import type { VirtualizedTableSort } from "../../../../../shared/virtualized-table/header/sort";
import { useVirtualizedTableFilterState } from "../../../../../shared/virtualized-table/use-filter-state";
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
  "entityTypeIds",
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

type EntityColumnMetadata = { appliesToEntityTypeIds: Set<VersionedUrl> };

type EntityTypeCountAndDepsByEntityTypeId = Record<
  VersionedUrl,
  {
    entitiesCount: number;
    propertyTypeIds: VersionedUrl[];
    linkTypeIds: VersionedUrl[];
  }
>;

/**
 * Generate the columns for the table.
 *
 * This has to be dynamic as the properties and link columns will depend on the types of entities discovered.
 * For each, we also need to know which properties and links apply to which types of entities.
 */
const generateColumns = ({
  closedMultiEntityTypes,
  definitions,
  hasRelevantEntities,
}: {
  closedMultiEntityTypes: ClosedMultiEntityType[];
  definitions?: ClosedMultiEntityTypesDefinitions;
  hasRelevantEntities: boolean;
}): VirtualizedTableColumn<FieldId, EntityColumnMetadata>[] => {
  const propertyTypesByVersionedUrl: Record<
    VersionedUrl,
    Pick<PropertyType, "$id" | "title"> & {
      appliesToEntityTypeIds: Set<VersionedUrl>;
    }
  > = {};

  const linkEntityTypesByVersionedUrl: Record<
    VersionedUrl,
    Pick<EntityType, "$id" | "title"> & {
      appliesToEntityTypeIds: Set<VersionedUrl>;
    }
  > = {};

  if (definitions) {
    for (const closedMultiEntityType of closedMultiEntityTypes) {
      const entityTypeIds = closedMultiEntityType.allOf.map((type) => type.$id);

      for (const schema of typedValues(closedMultiEntityType.properties)) {
        const propertyTypeId =
          "$ref" in schema ? schema.$ref : schema.items.$ref;

        const propertyType = definitions.propertyTypes[propertyTypeId];

        if (!propertyType) {
          throw new Error(
            `Property type ${propertyTypeId} not found in definitions`,
          );
        }

        propertyTypesByVersionedUrl[propertyTypeId] ??= {
          ...propertyType,
          appliesToEntityTypeIds: new Set(entityTypeIds),
        };

        for (const entityTypeId of entityTypeIds) {
          propertyTypesByVersionedUrl[
            propertyTypeId
          ].appliesToEntityTypeIds.add(entityTypeId);
        }
      }

      for (const linkTypeId of typedKeys(closedMultiEntityType.links ?? {})) {
        const linkType = definitions.entityTypes[linkTypeId];

        if (!linkType) {
          throw new Error(`Link type ${linkTypeId} not found in definitions`);
        }

        linkEntityTypesByVersionedUrl[linkTypeId] ??= {
          ...linkType,
          appliesToEntityTypeIds: new Set(entityTypeIds),
        };

        for (const entityTypeId of entityTypeIds) {
          linkEntityTypesByVersionedUrl[linkTypeId].appliesToEntityTypeIds.add(
            entityTypeId,
          );
        }
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
      label: "Type(s)",
      id: "entityTypeIds",
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
  closedMultiEntityType: ClosedMultiEntityType;
  entityLabel: string;
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  proposedEntityId?: EntityId;
  outgoingLinksByLinkTypeId: Record<
    VersionedUrl,
    {
      linkEntityId: EntityId;
      targetEntityId: EntityId;
      targetEntityLabel: string;
    }[]
  >;
  persistedEntity?: HashEntity;
  properties: PropertyObject;
  propertiesMetadata: PropertyObjectMetadata;
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
    const { pushToSlideStack } = useSlideStack();
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
          {row.closedMultiEntityType.allOf.map(({ title, $id }) => {
            return (
              <Box
                component="button"
                key={$id}
                onClick={() =>
                  pushToSlideStack({
                    kind: "entityType",
                    itemId: $id,
                  })
                }
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
                  {title}
                </ValueChip>
              </Box>
            );
          })}
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
          <ClickableCellChip
            onClick={() =>
              pushToSlideStack({
                kind: "entity",
                itemId: row.persistedEntity
                  ? row.persistedEntity.metadata.recordId.entityId
                  : row.proposedEntityId!,
              })
            }
            fontSize={typographySx.fontSize}
            label={row.entityLabel}
          />
        </TableCell>
        {columns
          .slice(
            hasRelevanceColumn
              ? fixedFieldIds.length
              : fixedFieldIds.length - 1,
          )
          .map((column) => {
            const appliesToEntity = row.entityTypeIds.some((id) =>
              column.metadata?.appliesToEntityTypeIds.has(id),
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
                  onEntityClick={(entityId) =>
                    pushToSlideStack({
                      kind: "entity",
                      itemId: entityId,
                    })
                  }
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
                metadata={{ dataTypeId: null, ...metadata }}
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
  persistedEntities: PersistedEntity[];
  persistedEntitiesSubgraph?: Subgraph<EntityRootType>;
  persistedEntitiesTypesInfo?: {
    entityTypes: ClosedMultiEntityTypesRootMap;
    definitions: ClosedMultiEntityTypesDefinitions;
  };
  proposedEntities: ProposedEntityOutput[];
  proposedEntitiesTypesInfo?: GetClosedMultiEntityTypesResponse;
  relevantEntityIds: EntityId[];
};

export const EntityResultTable = memo(
  ({
    dataIsLoading,
    persistedEntities,
    persistedEntitiesSubgraph,
    persistedEntitiesTypesInfo,
    proposedEntities,
    proposedEntitiesTypesInfo,
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
      closedMultiEntityTypes,
      filterDefinitions,
      initialFilterValues,
      unsortedRows,
    }: {
      closedMultiEntityTypes: ClosedMultiEntityType[];
      filterDefinitions: VirtualizedTableFilterDefinitionsByFieldId<FieldId>;
      initialFilterValues: VirtualizedTableFilterValuesByFieldId<FieldId>;
      unsortedRows: VirtualizedTableRow<EntityResultRow>[];
    } = useMemo(() => {
      const rowData: VirtualizedTableRow<EntityResultRow>[] = [];
      const entityTypesRecord: EntityTypeCountAndDepsByEntityTypeId = {};

      const closedTypesByKey: Record<string, ClosedMultiEntityType> = {};

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
        entityTypeIds: {
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
          closedMultiEntityType: ClosedMultiEntityType;
          entityLabel: string;
          entity:
            | ProposedEntityOutput
            | HashEntity<TypeIdsAndPropertiesForEntity>;
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
            ? new HashEntity(record.entity)
            : undefined;

        if (!entity) {
          throw new Error("Entity is undefined");
        }

        const entityId =
          "localEntityId" in entity
            ? entity.localEntityId
            : entity.metadata.recordId.entityId;

        const linkData =
          "linkData" in entity && !!entity.linkData
            ? {
                linkEntityTypeIds: entity.metadata.entityTypeIds,
                sourceEntityId: entity.linkData.leftEntityId,
                targetEntityId: entity.linkData.rightEntityId,
              }
            : "sourceEntityId" in entity &&
                entity.sourceEntityId &&
                "targetEntityId" in entity &&
                entity.targetEntityId
              ? {
                  linkEntityTypeIds: entity.entityTypeIds,
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

          for (const linkEntityTypeId of linkData.linkEntityTypeIds) {
            outgoingLinksBySourceEntityId[sourceEntityId][linkEntityTypeId] ??=
              [];
            outgoingLinksBySourceEntityId[sourceEntityId][
              linkEntityTypeId
            ].push({
              targetEntityId: linkData.targetEntityId,
              linkEntityId: entityId,
            });
          }

          /**
           * We show linked entities as chips in the source entity's row, so we don't want to include them in our
           * entities map.
           *
           * We also currently don't support in the UI links which links to other links.
           */
          continue;
        }

        const entityTypeIds =
          "entityTypeIds" in entity
            ? entity.entityTypeIds
            : entity.metadata.entityTypeIds;

        const typeInfo = isProposed
          ? proposedEntitiesTypesInfo
          : persistedEntitiesTypesInfo;

        if (!typeInfo) {
          continue;
        }

        const typeKey = entityTypeIds.toSorted().join(",");

        const closedMultiEntityType =
          closedTypesByKey[typeKey] ??
          getClosedMultiEntityTypeFromMap(typeInfo.entityTypes, entityTypeIds);

        closedTypesByKey[typeKey] ??= closedMultiEntityType;

        let entityLabel: string;
        try {
          entityLabel = generateEntityLabel(closedMultiEntityType, {
            properties: entity.properties,
            metadata: {
              entityTypeIds,
              recordId: {
                entityId,
                editionId: "irrelevant-here" as EntityEditionId,
              },
            },
          });
        } catch (error) {
          console.error(
            `Error generating entity label for entity ${entityId} with types ${entityTypeIds.join(", ")}: ${(error as Error).message}`,
          );
          entityLabel = "Unknown";
        }

        entitiesByEntityId[entityId] = {
          closedMultiEntityType,
          entity,
          entityLabel,
          record,
        };
      }

      for (const [
        entityId,
        { closedMultiEntityType, entity, entityLabel, record },
      ] of typedEntries(entitiesByEntityId)) {
        const isProposed = "localEntityId" in record;

        const typeInfo = isProposed
          ? proposedEntitiesTypesInfo
          : persistedEntitiesTypesInfo;

        if (!typeInfo) {
          continue;
        }

        const entityTypeIds =
          "entityTypeIds" in entity
            ? entity.entityTypeIds
            : entity.metadata.entityTypeIds;

        if (!isProposed && !persistedEntitiesSubgraph) {
          continue;
        }

        const outgoingLinksByLinkTypeId: EntityResultRow["outgoingLinksByLinkTypeId"] =
          {};

        for (const {
          $id: entityTypeId,
          title,
        } of closedMultiEntityType.allOf) {
          entityTypesRecord[entityTypeId] ??= {
            entitiesCount: 0,
            propertyTypeIds: typedValues(closedMultiEntityType.properties).map(
              (property) =>
                "$ref" in property ? property.$ref : property.items.$ref,
            ),
            linkTypeIds: typedKeys(closedMultiEntityType.links ?? {}),
          };

          entityTypesRecord[entityTypeId].entitiesCount++;

          staticFilterDefs.entityTypeIds.options[entityTypeId] ??= {
            label: title,
            count: 0,
            value: entityTypeId,
          };
          staticFilterDefs.entityTypeIds.options[entityTypeId].count++;
          staticFilterDefs.entityTypeIds.initialValue.add(entityTypeId);

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

          for (const linkTypeId of typedKeys(
            closedMultiEntityType.links ?? {},
          )) {
            const linkType = typeInfo.definitions?.entityTypes[linkTypeId];

            if (!linkType) {
              throw new Error(
                `Link type ${linkTypeId} not found in definitions`,
              );
            }

            dynamicFilterDefs[linkTypeId] ??= {
              header: linkType.title,
              initialValue: new Set<string | null>(),
              options: {},
              type: "checkboxes",
            } as const;

            const linkedEntities =
              outgoingLinksByLinkTypeId[linkType.$id] ?? [];

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
                  dynamicFilterDefs[linkTypeId].initialValue as Set<
                    string | null
                  >
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
              dynamicFilterDefs[linkTypeId].options[missingValueString]!
                .count++;
              (
                dynamicFilterDefs[linkTypeId].initialValue as Set<string | null>
              ).add(null);
            }
          }

          for (const schema of typedValues(closedMultiEntityType.properties)) {
            const propertyTypeId =
              "$ref" in schema ? schema.$ref : schema.items.$ref;

            const propertyType =
              typeInfo.definitions?.propertyTypes[propertyTypeId];

            if (!propertyType) {
              throw new Error(
                `Property type ${propertyTypeId} not found in definitions`,
              );
            }

            const baseUrl = extractBaseUrl(propertyTypeId);

            dynamicFilterDefs[propertyTypeId] ??= {
              header: propertyType.title,
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
              dynamicFilterDefs[propertyTypeId].initialValue as Set<
                string | null
              >
            ).add(value);
          }
        }

        const status = isProposed
          ? "Proposed"
          : record.operation === "update"
            ? "Updated"
            : "Created";

        const relevance = relevantEntityIds.find((relevantEntityId) =>
          entityId.startsWith(relevantEntityId),
        )
          ? "Yes"
          : "No";

        /**
         * Account for the entity's values in the filters, other than types which are handled above when processing the entity's types.
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

        staticFilterDefs.entityLabel.options[entityLabel] ??= {
          label: entityLabel,
          count: 0,
          value: entityLabel,
        };
        staticFilterDefs.entityLabel.options[entityLabel].count++;
        staticFilterDefs.entityLabel.initialValue.add(entityLabel);

        rowData.push({
          id: entityId,
          data: {
            closedMultiEntityType,
            entityLabel,
            entityTypeIds: mustHaveAtLeastOne(entityTypeIds.toSorted()),
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
            ? !entityType.linkTypeIds.includes(dynamicDefId)
            : !entityType.propertyTypeIds.includes(dynamicDefId);

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
        closedMultiEntityTypes: Object.values(closedTypesByKey),
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
      persistedEntities,
      persistedEntitiesSubgraph,
      persistedEntitiesTypesInfo,
      proposedEntities,
      proposedEntitiesTypesInfo,
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
                } else if (fieldId === "entityTypeIds") {
                  if (!Array.isArray(valueToCheck)) {
                    throw new Error(
                      `Expected array of entityTypeIds for row value, got ${valueToCheck}`,
                    );
                  }
                  if (typeof currentValue === "string") {
                    throw new Error(
                      `Expected Set for entityTypeIds filter, got ${currentValue}`,
                    );
                  }
                  if (
                    !valueToCheck.some((entityTypeId) =>
                      currentValue.has(entityTypeId),
                    )
                  ) {
                    return false;
                  }
                } else {
                  if (Array.isArray(valueToCheck)) {
                    throw new Error(
                      `Expected string for row value, got ${valueToCheck}`,
                    );
                  }
                  if (
                    !isValueIncludedInFilter({
                      valueToCheck,
                      currentValue,
                    })
                  ) {
                    return false;
                  }
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

              const valueA = a.data.properties[baseUrl];
              const valueB = b.data.properties[baseUrl];

              if (typeof valueA === "number" && typeof valueB === "number") {
                return (valueA - valueB) * direction;
              }

              return (
                stringifyPropertyValue(valueA).localeCompare(
                  stringifyPropertyValue(valueB),
                ) * direction
              );
            }

            if (field === "entityTypeIds") {
              return (
                a.data[field].join(",").localeCompare(b.data[field].join(",")) *
                direction
              );
            }

            return a.data[field].localeCompare(b.data[field]) * direction;
          }),
      [filterValues, sort, unsortedRows],
    );

    const columns = useMemo(
      () =>
        generateColumns({
          closedMultiEntityTypes,
          definitions: persistedEntities.length
            ? persistedEntitiesTypesInfo?.definitions
            : proposedEntitiesTypesInfo?.definitions,
          hasRelevantEntities: relevantEntityIds.length > 0,
        }),
      [
        closedMultiEntityTypes,
        persistedEntities.length,
        persistedEntitiesTypesInfo?.definitions,
        proposedEntitiesTypesInfo?.definitions,
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
