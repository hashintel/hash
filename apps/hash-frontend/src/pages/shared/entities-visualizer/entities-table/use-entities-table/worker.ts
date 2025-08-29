import { getEntityRevision } from "@blockprotocol/graph/stdlib";
import type { BaseUrl } from "@blockprotocol/type-system";
import {
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
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { format } from "date-fns";

import type {
  EntitiesTableColumn,
  EntitiesTableColumnKey,
  EntitiesTableRow,
  EntitiesTableRowPropertyCell,
  GenerateEntitiesTableDataParams,
  GenerateEntitiesTableDataResultMessage,
  WorkerDataReturn,
} from "../types";
import { isGenerateEntitiesTableDataRequestMessage } from "../types";

const staticColumnDefinitionsByKey: Record<
  Exclude<EntitiesTableColumnKey, "entityLabel">,
  EntitiesTableColumn
> = {
  entityTypes: {
    title: "Entity Type",
    id: "entityTypes",
    width: 200,
  },
  web: {
    title: "Web",
    id: "web",
    width: 200,
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
  lastEditedBy: {
    title: "Last Edited By",
    id: "lastEditedBy",
    width: 200,
  },
  created: {
    title: "Created",
    id: "created",
    width: 200,
  },
  createdBy: {
    title: "Created By",
    id: "createdBy",
    width: 200,
  },
};

let activeRequestId: string | null;

const isCancelled = (requestId: string) => {
  return activeRequestId !== requestId;
};

const generateTableData = (
  params: GenerateEntitiesTableDataParams,
  requestId: string,
): WorkerDataReturn | "cancelled" => {
  const {
    actorsByAccountId,
    closedMultiEntityTypesRootMap,
    definitions,
    entities,
    entityTypesWithMultipleVersionsPresent,
    subgraph: serializedSubgraph,
    hideColumns,
    hideArchivedColumn,
    hidePropertiesColumns,
    webNameByWebId,
  } = params;

  if (isCancelled(requestId)) {
    return "cancelled";
  }

  const subgraph = deserializeSubgraph(serializedSubgraph);

  let noSource = 0;
  let noTarget = 0;

  const sourcesByEntityId: {
    [entityId: string]: {
      count: number;
      entityId: string;
      label: string;
    };
  } = {};
  const targetsByEntityId: {
    [entityId: string]: {
      count: number;
      entityId: string;
      label: string;
    };
  } = {};

  const propertyColumnsMap = new Map<string, EntitiesTableColumn>();

  const entityTypeTitlesSharedAcrossAllEntities = new Set<string>();

  const rows: EntitiesTableRow[] = [];

  for (const [index, serializedEntity] of entities.entries()) {
    if (isCancelled(requestId)) {
      return "cancelled";
    }

    const entity = new HashEntity(serializedEntity);

    const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
      closedMultiEntityTypesRootMap,
      entity.metadata.entityTypeIds,
    );

    const entityLabel = generateEntityLabel(closedMultiEntityType, entity);

    let entityIcon: string | undefined;
    const entityTypeTitles = new Set<string>();
    for (const entityType of closedMultiEntityType.allOf) {
      if (index === 0) {
        /**
         * We add the titles of the types of the first entity to the set.
         */
        entityTypeTitlesSharedAcrossAllEntities.add(entityType.title);
      } else {
        entityTypeTitles.add(entityType.title);
      }

      for (const typeOrAncestor of entityType.allOf) {
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

    const entityNamespace =
      webNameByWebId[
        extractWebIdFromEntityId(entity.metadata.recordId.entityId)
      ] ?? "loading";

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

    const lastEditedBy =
      actorsByAccountId[entity.metadata.provenance.edition.createdById];

    const created = format(
      new Date(entity.metadata.provenance.createdAtDecisionTime),
      "yyyy-MM-dd HH:mm",
    );

    const createdBy = actorsByAccountId[entity.metadata.provenance.createdById];

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
        propertyColumnsMap.set(baseUrl, {
          id: baseUrl,
          title: propertyType.title,
          /**
           * This fixed width will be adjusted in the caller by measuring the text.
           * We can't measure the text here because we can't create DOM elements in the worker.
           */
          width: 200,
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
        entityId: sourceEntity.entityId,
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
        entityId: targetEntity.entityId,
        label: targetEntity.label,
      };
      targetsByEntityId[targetEntity.entityId]!.count++;
    } else {
      noSource += 1;
      noTarget += 1;
    }

    const web = `@${entityNamespace}`;

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
          version: entityTypesWithMultipleVersionsPresent.includes(
            entityType.$id,
          )
            ? extractVersion(entityType.$id)
            : undefined,
        };
      }),
      web,
      archived: isPage
        ? simplifyProperties(entity.properties as PageProperties).archived
        : entity.metadata.archived,
      lastEdited,
      lastEditedBy: lastEditedBy ?? "loading",
      created,
      createdBy: createdBy ?? "loading",
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

  const columnsToHide = hideColumns ?? [];
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

  if (!hidePropertiesColumns) {
    columns.push(
      ...propertyColumns.sort((a, b) => a.title.localeCompare(b.title)),
    );
  }

  if (isCancelled(requestId)) {
    return "cancelled";
  }

  return {
    columns,
    rows,
    filterData: {
      noSourceCount: noSource,
      noTargetCount: noTarget,
      sources: Object.values(sourcesByEntityId),
      targets: Object.values(targetsByEntityId),
    },
  };
};

// eslint-disable-next-line no-restricted-globals
self.onmessage = ({ data }) => {
  if (isGenerateEntitiesTableDataRequestMessage(data)) {
    const params = data.params;

    const requestId = generateUuid();
    activeRequestId = requestId;

    const result = generateTableData(params, requestId);

    if (result !== "cancelled") {
      /**
       * Split the rows into chunks to avoid the message being too large.
       */
      const chunkSize = 20_000;
      const chunkedRows: EntitiesTableRow[][] = [];
      for (let i = 0; i < result.rows.length; i += chunkSize) {
        chunkedRows.push(result.rows.slice(i, i + chunkSize));
      }

      if (chunkedRows.length === 0) {
        // eslint-disable-next-line no-restricted-globals
        self.postMessage({
          type: "generateEntitiesTableDataResult",
          requestId,
          done: true,
          result: {
            ...result,
            rows: [],
          },
        } satisfies GenerateEntitiesTableDataResultMessage);
      }

      for (const [index, rows] of chunkedRows.entries()) {
        // eslint-disable-next-line no-restricted-globals
        self.postMessage({
          type: "generateEntitiesTableDataResult",
          requestId,
          done: index === chunkedRows.length - 1,
          result: {
            ...result,
            rows,
          },
        } satisfies GenerateEntitiesTableDataResultMessage);
      }
    } else {
      // Cancelled
    }
  }
};
