import { getEntityRevision } from "@blockprotocol/graph/stdlib";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractVersion,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import {
  generateEntityLabel,
  generateLinkEntityLabel,
} from "@local/hash-isomorphic-utils/generate-entity-label";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { format } from "date-fns";

import { gridHeaderBaseFont } from "../../../../../components/grid/grid";
import type {
  EntitiesTableColumn,
  EntitiesTableColumnKey,
  EntitiesTableData,
  EntitiesTableRow,
  EntitiesTableRowPropertyCell,
  GenerateEntitiesTableDataParams,
  VisibleDataTypeIdsByPropertyBaseUrl,
} from "../../types";

const staticColumnDefinitionsByKey: Record<
  Exclude<EntitiesTableColumnKey, "entityLabel">,
  EntitiesTableColumn
> = {
  entityTypes: {
    title: "Entity Type",
    id: "entityTypes",
    width: 220,
  },
  webId: {
    title: "Web",
    id: "webId",
    width: 150,
  },
  sourceEntity: {
    title: "Source",
    id: "sourceEntity",
    width: 200,
  },
  targetEntity: {
    title: "Target",
    id: "targetEntity",
    width: 200,
  },
  archived: {
    title: "Archived",
    id: "archived",
    width: 200,
  },
  lastEdited: {
    title: "Last Edited",
    id: "lastEdited",
    width: 200,
  },
  lastEditedById: {
    title: "Last Edited By",
    id: "lastEditedById",
    width: 200,
  },
  created: {
    title: "Created",
    id: "created",
    width: 200,
  },
  createdById: {
    title: "Created By",
    id: "createdById",
    width: 200,
  },
};

let canvas: HTMLCanvasElement | undefined = undefined;

export const getTextWidth = (text: string) => {
  canvas ??= document.createElement("canvas");

  const context = canvas.getContext("2d")!;

  context.font = gridHeaderBaseFont;

  const metrics = context.measureText(text);
  return metrics.width;
};

export const generateTableDataFromRows = (
  params: GenerateEntitiesTableDataParams,
): EntitiesTableData => {
  const {
    closedMultiEntityTypesRootMap,
    definitions,
    entities,
    subgraph,
    hideColumns,
    hideArchivedColumn,
  } = params;

  let noSource = 0;
  let noTarget = 0;

  const sourcesByEntityId: {
    [entityId: string]: {
      count: number;
      label: string;
    };
  } = {};
  const targetsByEntityId: {
    [entityId: string]: {
      count: number;
      label: string;
    };
  } = {};

  const dataTypesByProperty: VisibleDataTypeIdsByPropertyBaseUrl = {};

  const propertyColumnsMap = new Map<string, EntitiesTableColumn>();

  const entityTypesWithMultipleVersions = new Set<VersionedUrl>();
  const firstSeenEntityTypeByBaseUrl: { [baseUrl: string]: VersionedUrl } = {};

  const entityTypeTitlesSharedAcrossAllEntities = new Set<string>();

  const rows: EntitiesTableRow[] = [];

  for (const [index, serializedEntity] of entities.entries()) {
    const entity = new HashEntity(serializedEntity);

    const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
      closedMultiEntityTypesRootMap,
      entity.metadata.entityTypeIds,
    );

    const entityLabel = generateEntityLabel(closedMultiEntityType, entity);

    for (const entityTypeId of entity.metadata.entityTypeIds) {
      const baseUrl = extractBaseUrl(entityTypeId);

      if (
        firstSeenEntityTypeByBaseUrl[baseUrl] !== entityTypeId &&
        firstSeenEntityTypeByBaseUrl[baseUrl]
      ) {
        entityTypesWithMultipleVersions.add(entityTypeId);
        entityTypesWithMultipleVersions.add(
          firstSeenEntityTypeByBaseUrl[baseUrl],
        );
      } else {
        firstSeenEntityTypeByBaseUrl[baseUrl] = entityTypeId;
      }
    }

    let entityIcon: string | undefined;
    const entityTypeTitles = new Set<string>();
    for (const entityTypeMetadata of closedMultiEntityType.allOf) {
      if (index === 0) {
        /**
         * We add the titles of the types of the first entity to the set.
         */
        entityTypeTitlesSharedAcrossAllEntities.add(entityTypeMetadata.title);
      } else {
        entityTypeTitles.add(entityTypeMetadata.title);
      }

      for (const typeOrAncestor of entityTypeMetadata.allOf) {
        if (typeOrAncestor.icon) {
          entityIcon = typeOrAncestor.icon;
          break;
        }
      }
    }

    /**
     * Check for any titles in our shared set that aren't present in the current entity's types.
     * If they aren't present, remove them from the shared set – they aren't shared.
     */
    for (const sharedTitle of entityTypeTitlesSharedAcrossAllEntities) {
      if (!entityTypeTitles.has(sharedTitle)) {
        entityTypeTitlesSharedAcrossAllEntities.delete(sharedTitle);
      }
    }

    const entityId = entity.metadata.recordId.entityId;

    const isPage = includesPageEntityTypeId(entity.metadata.entityTypeIds);

    /**
     * @todo: consider displaying handling this differently for pages, where
     * updates on nested blocks/text entities may be a better indicator of
     * when a page has been last edited.
     */
    const lastEdited = format(
      new Date(entity.metadata.temporalVersioning.decisionTime.start.limit),
      "yyyy-MM-dd HH:mm",
    );

    const lastEditedById = entity.metadata.provenance.edition.createdById;

    const created = format(
      new Date(entity.metadata.provenance.createdAtDecisionTime),
      "yyyy-MM-dd HH:mm",
    );

    const createdById = entity.metadata.provenance.createdById;

    const propertyCellsForRow: Record<BaseUrl, EntitiesTableRowPropertyCell> =
      {};

    for (const [baseUrl, schema] of typedEntries(
      closedMultiEntityType.properties,
    )) {
      const propertyTypeId = "$ref" in schema ? schema.$ref : schema.items.$ref;

      const propertyType = definitions.propertyTypes[propertyTypeId];

      if (!propertyType) {
        throw new Error(
          `Property type not found for ${propertyTypeId} in ${entityId}`,
        );
      }

      const isArray = "items" in schema || "items" in propertyType.oneOf[0];

      if (entity.properties[baseUrl] !== undefined) {
        const propertyMetadata = entity.propertyMetadata([baseUrl]);

        if (!propertyMetadata) {
          throw new Error(
            `Property metadata not found for ${baseUrl} in ${entityId}`,
          );
        }

        propertyCellsForRow[baseUrl] = {
          isArray,
          propertyMetadata,
          value: entity.properties[baseUrl],
        };
      }

      if (!propertyColumnsMap.has(baseUrl)) {
        const width = getTextWidth(propertyType.title) + 85;

        propertyColumnsMap.set(baseUrl, {
          id: baseUrl,
          title: propertyType.title,
          width,
        });
      }
    }

    let sourceEntity: EntitiesTableRow["sourceEntity"];
    let targetEntity: EntitiesTableRow["targetEntity"];
    if (entity.linkData) {
      const source = getEntityRevision(subgraph, entity.linkData.leftEntityId);
      const target = getEntityRevision(subgraph, entity.linkData.rightEntityId);

      const sourceClosedMultiEntityType = source
        ? getClosedMultiEntityTypeFromMap(
            closedMultiEntityTypesRootMap,
            source.metadata.entityTypeIds,
          )
        : undefined;

      const sourceEntityLabel =
        !source || !sourceClosedMultiEntityType
          ? entity.linkData.leftEntityId
          : source.linkData
            ? generateLinkEntityLabel(subgraph, source, {
                closedType: sourceClosedMultiEntityType,
                entityTypeDefinitions: definitions,
                closedMultiEntityTypesRootMap,
              })
            : generateEntityLabel(sourceClosedMultiEntityType, source);

      const sourceDisplayFields = sourceClosedMultiEntityType
        ? getDisplayFieldsForClosedEntityType(sourceClosedMultiEntityType)
        : undefined;

      sourceEntity = {
        entityId: entity.linkData.leftEntityId,
        label: sourceEntityLabel,
        icon: sourceDisplayFields?.icon,
        isLink: !!source?.linkData,
      };

      sourcesByEntityId[sourceEntity.entityId] ??= {
        count: 0,
        label: sourceEntity.label,
      };
      sourcesByEntityId[sourceEntity.entityId]!.count++;

      const targetClosedMultiEntityType = target
        ? getClosedMultiEntityTypeFromMap(
            closedMultiEntityTypesRootMap,
            target.metadata.entityTypeIds,
          )
        : undefined;

      const targetEntityLabel =
        !target || !targetClosedMultiEntityType
          ? entity.linkData.leftEntityId
          : target.linkData
            ? generateLinkEntityLabel(subgraph, target, {
                closedType: targetClosedMultiEntityType,
                entityTypeDefinitions: definitions,
                closedMultiEntityTypesRootMap,
              })
            : generateEntityLabel(targetClosedMultiEntityType, target);

      const targetDisplayFields = targetClosedMultiEntityType
        ? getDisplayFieldsForClosedEntityType(targetClosedMultiEntityType)
        : undefined;

      targetEntity = {
        entityId: entity.linkData.rightEntityId,
        label: targetEntityLabel,
        icon: targetDisplayFields?.icon,
        isLink: !!target?.linkData,
      };

      targetsByEntityId[targetEntity.entityId] ??= {
        count: 0,
        label: targetEntity.label,
      };
      targetsByEntityId[targetEntity.entityId]!.count++;
    } else {
      noSource += 1;
      noTarget += 1;
    }

    for (const [baseUrl, { metadata }] of typedEntries(
      entity.propertiesMetadata.value,
    )) {
      if (metadata && "dataTypeId" in metadata && metadata.dataTypeId) {
        dataTypesByProperty[baseUrl] ??= new Set();

        const dataType = definitions.dataTypes[metadata.dataTypeId];

        if (!dataType) {
          throw new Error(
            `Could not find dataType with id ${metadata.dataTypeId} in subgraph`,
          );
        }

        /**
         * As there is only one instance of each DataType in the subgraph, it'll be the same object in memory,
         * and the Set equality check will work.
         */
        dataTypesByProperty[baseUrl].add(dataType);
      }
    }

    rows.push({
      rowId: entityId,
      entityId,
      entityLabel,
      entityIcon,
      entityTypes: closedMultiEntityType.allOf.map((entityType) => {
        let isLink = false;
        let icon: string | undefined;

        for (const typeOrAncestor of entityType.allOf) {
          if (!icon && typeOrAncestor.icon) {
            icon = typeOrAncestor.icon;
          }

          if (
            !isLink &&
            typeOrAncestor.$id === blockProtocolEntityTypes.link.entityTypeId
          ) {
            isLink = true;
          }
        }

        return {
          title: entityType.title,
          entityTypeId: entityType.$id,
          icon,
          isLink,
          version: extractVersion(entityType.$id),
        };
      }),
      webId: extractWebIdFromEntityId(entity.entityId),
      archived: isPage
        ? simplifyProperties(entity.properties as PageProperties).archived
        : entity.metadata.archived,
      lastEdited,
      lastEditedById,
      created,
      createdById,
      sourceEntity,
      targetEntity,
      applicableProperties: typedKeys(closedMultiEntityType.properties),
      ...propertyCellsForRow,
    });
  }

  const propertyColumns = Array.from(propertyColumnsMap.values());

  const columns: EntitiesTableColumn[] = [
    {
      title:
        entityTypeTitlesSharedAcrossAllEntities.size === 0
          ? "Entity"
          : entityTypeTitlesSharedAcrossAllEntities.values().next().value!,
      id: "entityLabel",
      width: 300,
      grow: 1,
    },
  ];

  const columnsToHide = hideColumns ? [...hideColumns] : [];
  if (hideArchivedColumn) {
    columnsToHide.push("archived");
  }

  if (noSource === rows.length) {
    columnsToHide.push("sourceEntity");
  }

  if (noTarget === rows.length) {
    columnsToHide.push("targetEntity");
  }

  for (const [columnKey, definition] of typedEntries(
    staticColumnDefinitionsByKey,
  )) {
    if (!columnsToHide.includes(columnKey)) {
      columns.push(definition);
    }
  }

  columns.push(
    ...propertyColumns.sort((a, b) => a.title.localeCompare(b.title)),
  );

  return {
    columns,
    rows,
    entityTypesWithMultipleVersionsPresent: entityTypesWithMultipleVersions,
    visibleDataTypeIdsByPropertyBaseUrl: dataTypesByProperty,
    visibleRowsFilterData: {
      noSourceCount: noSource,
      noTargetCount: noTarget,
      sources: sourcesByEntityId,
      targets: targetsByEntityId,
    },
  };
};
