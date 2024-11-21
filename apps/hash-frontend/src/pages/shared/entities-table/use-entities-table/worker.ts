import { extractVersion } from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import {
  generateEntityLabel,
  generateLinkEntityLabel,
} from "@local/hash-isomorphic-utils/generate-entity-label";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { sleep } from "@local/hash-isomorphic-utils/sleep";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  extractOwnedByIdFromEntityId,
  linkEntityTypeUrl,
} from "@local/hash-subgraph";
import {
  getEntityRevision,
  getEntityTypeById,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { format } from "date-fns";

import type {
  ActorTableData,
  EntitiesTableData,
  GenerateEntitiesTableDataParams,
  GenerateEntitiesTableDataResultMessage,
  TypeEntitiesRow,
} from "./types";
import { isGenerateEntitiesTableDataRequestMessage } from "./types";

const columnDefinitionsByKey: Record<
  keyof TypeEntitiesRow,
  {
    title: string;
    id: string;
    width: number;
  }
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

const isCancelled = async (requestId: string) => {
  await sleep(0);
  return activeRequestId !== requestId;
};

const generateTableData = async (
  params: GenerateEntitiesTableDataParams,
  requestId: string,
): Promise<EntitiesTableData | "cancelled"> => {
  const {
    actorsByAccountId,
    entities,
    entitiesHaveSameType,
    entityTypesWithMultipleVersionsPresent,
    entityTypes,
    usedPropertyTypesByEntityTypeId,
    subgraph: serializedSubgraph,
    hideColumns,
    hidePageArchivedColumn,
    hidePropertiesColumns,
    isViewingOnlyPages,
    webNameByOwnedById,
  } = params;

  if (await isCancelled(requestId)) {
    return "cancelled";
  }

  const subgraph = deserializeSubgraph(serializedSubgraph);

  const lastEditedBySet = new Set<ActorTableData>();
  const createdBySet = new Set<ActorTableData>();
  const entityTypeTitleCount: {
    [entityTypeTitle: string]: number | undefined;
  } = {};

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

  const webCountById: { [web: string]: number } = {};

  const propertyColumnsMap = new Map<string, SizedGridColumn>();

  for (const { propertyType, width } of Object.values(
    usedPropertyTypesByEntityTypeId,
  ).flat()) {
    const propertyTypeBaseUrl = extractBaseUrl(propertyType.schema.$id);

    if (!propertyColumnsMap.has(propertyTypeBaseUrl)) {
      propertyColumnsMap.set(propertyTypeBaseUrl, {
        id: propertyTypeBaseUrl,
        title: propertyType.schema.title,
        width: width + 70,
      });
    }
  }
  const propertyColumns = Array.from(propertyColumnsMap.values());

  const columns: SizedGridColumn[] = [
    {
      title: entitiesHaveSameType
        ? (entityTypes.find(
            ({ $id }) =>
              entities[0] &&
              $id === new Entity(entities[0]).metadata.entityTypeIds[0],
          )?.title ?? "Entity")
        : "Entity",
      id: "entityLabel",
      width: 300,
      grow: 1,
    },
  ];

  const columnsToHide = hideColumns ?? [];
  if (!isViewingOnlyPages || hidePageArchivedColumn) {
    columnsToHide.push("archived");
  }

  for (const [columnKey, definition] of typedEntries(columnDefinitionsByKey)) {
    if (!columnsToHide.includes(columnKey)) {
      columns.push(definition);
    }
  }

  if (!hidePropertiesColumns) {
    columns.push(
      ...propertyColumns.sort((a, b) => a.title.localeCompare(b.title)),
    );
  }

  const rows: TypeEntitiesRow[] = [];
  for (const serializedEntity of entities) {
    if (await isCancelled(requestId)) {
      return "cancelled";
    }

    const entity = new Entity(serializedEntity);

    const entityLabel = generateEntityLabel(subgraph, entity);

    const currentEntitysTypes = entityTypes.filter((type) =>
      entity.metadata.entityTypeIds.includes(type.$id),
    );

    const entityIcon = currentEntitysTypes[0]?.icon;

    const entityNamespace =
      webNameByOwnedById[
        extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId)
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

    if (lastEditedBy) {
      lastEditedBySet.add({
        accountId: lastEditedBy.accountId,
        displayName: lastEditedBy.displayName,
      });
    }

    const created = format(
      new Date(entity.metadata.provenance.createdAtDecisionTime),
      "yyyy-MM-dd HH:mm",
    );

    const createdBy = actorsByAccountId[entity.metadata.provenance.createdById];

    if (createdBy) {
      createdBySet.add(createdBy);
    }

    const applicableProperties = currentEntitysTypes.flatMap((entityType) =>
      usedPropertyTypesByEntityTypeId[entityType.$id]!.map(({ propertyType }) =>
        extractBaseUrl(propertyType.schema.$id),
      ),
    );

    let sourceEntity: TypeEntitiesRow["sourceEntity"];
    let targetEntity: TypeEntitiesRow["targetEntity"];
    if (entity.linkData) {
      const source = getEntityRevision(subgraph, entity.linkData.leftEntityId);
      const target = getEntityRevision(subgraph, entity.linkData.rightEntityId);

      const sourceEntityLabel = !source
        ? entity.linkData.leftEntityId
        : source.linkData
          ? generateLinkEntityLabel(subgraph, source)
          : generateEntityLabel(subgraph, source);

      /**
       * @todo H-3363 use closed schema to get entity's icon
       */
      const sourceEntityType = source
        ? getEntityTypeById(subgraph, source.metadata.entityTypeIds[0])
        : undefined;

      sourceEntity = {
        entityId: entity.linkData.leftEntityId,
        label: sourceEntityLabel,
        icon: sourceEntityType?.schema.icon,
        isLink: !!source?.linkData,
      };

      sourcesByEntityId[sourceEntity.entityId] ??= {
        count: 0,
        entityId: sourceEntity.entityId,
        label: sourceEntity.label,
      };
      sourcesByEntityId[sourceEntity.entityId]!.count++;

      const targetEntityLabel = !target
        ? entity.linkData.leftEntityId
        : target.linkData
          ? generateLinkEntityLabel(subgraph, target)
          : generateEntityLabel(subgraph, target);

      /**
       * @todo H-3363 use closed schema to get entity's icon
       */
      const targetEntityType = target
        ? getEntityTypeById(subgraph, target.metadata.entityTypeIds[0])
        : undefined;

      targetEntity = {
        entityId: entity.linkData.rightEntityId,
        label: targetEntityLabel,
        icon: targetEntityType?.schema.icon,
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

    for (const entityType of currentEntitysTypes) {
      entityTypeTitleCount[entityType.title] ??= 0;
      entityTypeTitleCount[entityType.title]!++;
    }

    const web = `@${entityNamespace}`;
    webCountById[web] ??= 0;
    webCountById[web]++;

    rows.push({
      rowId: entityId,
      entityId,
      entityLabel,
      entityIcon,
      entityTypes: currentEntitysTypes.map((entityType) => {
        /**
         * @todo H-3363 use closed schema to take account of indirectly inherited link entity types
         */
        const isLink = !!entityType.allOf?.some(
          (allOf) => allOf.$ref === linkEntityTypeUrl,
        );

        let entityTypeLabel = entityType.title;
        if (entityTypesWithMultipleVersionsPresent.includes(entityType.$id)) {
          entityTypeLabel += ` v${extractVersion(entityType.$id)}`;
        }

        return {
          title: entityTypeLabel,
          entityTypeId: entityType.$id,
          icon: entityType.icon,
          isLink,
        };
      }),
      web,
      archived: isPage
        ? simplifyProperties(entity.properties as PageProperties).archived
        : undefined,
      lastEdited,
      lastEditedBy: lastEditedBy ?? "loading",
      created,
      createdBy: createdBy ?? "loading",
      sourceEntity,
      targetEntity,
      applicableProperties,
      ...propertyColumns.reduce((fields, column) => {
        if (column.id) {
          const propertyValue = entity.properties[column.id as BaseUrl];

          const value =
            typeof propertyValue === "undefined"
              ? ""
              : typeof propertyValue === "number"
                ? propertyValue
                : stringifyPropertyValue(propertyValue);

          return { ...fields, [column.id]: value };
        }

        return fields;
      }, {}),
    });
  }

  return {
    columns,
    rows,
    filterData: {
      lastEditedByActors: [...lastEditedBySet],
      createdByActors: [...createdBySet],
      entityTypeTitles: entityTypeTitleCount,
      webs: webCountById,
      noSourceCount: noSource,
      noTargetCount: noTarget,
      sources: Object.values(sourcesByEntityId),
      targets: Object.values(targetsByEntityId),
    },
  };
};

// eslint-disable-next-line no-restricted-globals
self.onmessage = async ({ data }) => {
  if (isGenerateEntitiesTableDataRequestMessage(data)) {
    const params = data.params;

    const requestId = generateUuid();
    activeRequestId = requestId;

    const result = await generateTableData(params, requestId);

    if (result !== "cancelled") {
      /**
       * Split the rows into chunks to avoid the message being too large.
       */
      const chunkSize = 20_000;
      const chunkedRows: TypeEntitiesRow[][] = [];
      for (let i = 0; i < result.rows.length; i += chunkSize) {
        chunkedRows.push(result.rows.slice(i, i + chunkSize));
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
