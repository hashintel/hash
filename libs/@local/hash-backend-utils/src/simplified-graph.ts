import {
  getUserSimpleWebs,
  SimpleWeb,
} from "@apps/hash-api/src/ai/gpt/shared/webs";
import { getLatestEntityById } from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  typedEntries,
  typedKeys,
  typedValues,
} from "@local/advanced-types/typed-entries";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import {
  OrganizationProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { Entity, Subgraph } from "@local/hash-subgraph";
import {
  EntityId,
  entityIdFromComponents,
  EntityUuid,
  extractDraftIdFromEntityId,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import {
  getPropertyTypeById,
  getPropertyTypeForEntity,
} from "@local/hash-subgraph/src/stdlib/subgraph/element/property-type";
import {
  getEntityTypeById,
  getOutgoingLinksForEntity,
} from "@local/hash-subgraph/stdlib";

/**
 * A simplified object representing an entity type, which will be converted to plain text for the response.
 */
export type SimpleEntityType = {
  /** The entity type's title / name */
  title: string;
  /** A description of the entity type */
  description: string;
  /**
   * The properties that entities of this type may have – the keys are the property titles, and the values are the
   * property descriptions.
   */
  properties: Record<string, string>;
  /**
   * The links that entities of this type may have – the keys are the link titles, and the values are the link
   * descriptions.
   */
  links: Record<string, string>;
  /**
   * The unique id for this entity type. The name of the web it belongs to can be found in this id prefixed by an @,
   * e.g. `@hash` or `@alice`
   */
  entityTypeId: string;
};

export const getSimpleEntityType = (
  subgraph: Subgraph,
  entityTypeId: VersionedUrl,
) => {
  const typeSchema = getEntityTypeById(subgraph, entityTypeId)?.schema;
  if (!typeSchema) {
    throw new Error("Entity type not found in subgraph");
  }

  const properties: SimpleEntityType["properties"] = {};
  for (const [_baseUrl, propertySchema] of typedEntries(
    typeSchema.properties,
  )) {
    const propertyTypeId =
      "$ref" in propertySchema
        ? propertySchema.$ref
        : propertySchema.items.$ref;

    const propertyType = getPropertyTypeById(subgraph, propertyTypeId);
    if (!propertyType) {
      throw new Error("Property type not found in subgraph");
    }

    properties[propertyType.schema.title] =
      propertyType.schema.description ?? "";
  }

  const links: SimpleEntityType["links"] = {};
  for (const linkTypeId of typedKeys(typeSchema.links ?? {})) {
    const linkType = getEntityTypeById(subgraph, linkTypeId);
    if (!linkType) {
      throw new Error("Link type not found in subgraph");
    }

    links[linkType.schema.title] = linkType.schema.description ?? "";
  }

  return {
    title: typeSchema.title,
    description: typeSchema.description ?? "",
    entityTypeId,
    properties,
    links,
  };
};

export type BaseSimpleEntityFields = {
  /** Whether or not the entity is in draft */
  draft: boolean;
  /** The unique id for the entity, to identify it for future requests or as the target of links from other entities */
  entityUuid: string;
  /** The title of the entity type this entity belongs to */
  entityType: string;
  /** The properties of the entity, with the property title as the key */
  properties: Record<string, unknown>;
  /** A link to view full details of the entity which users can follow to find out more */
  entityHref: string;
};

export type SimpleLink = BaseSimpleEntityFields & {
  /** The unique entityUuid of the target of this link. */
  targetEntityUuid: string;
};

export type SimpleEntity = BaseSimpleEntityFields & {
  /**
   * Links from the entity to other entities. The link itself can have properties, containing data about the
   * relationship.
   */
  links: SimpleLink[];
  /**
   * The web that the entity belongs to
   */
  webUuid: string;
};

const createBaseSimpleEntityFields = (
  subgraph: Subgraph,
  entity: Entity,
  shortname: string,
): BaseSimpleEntityFields => {
  const typeSchema = getEntityTypeById(subgraph, entity.metadata.entityTypeId);
  if (!typeSchema) {
    throw new Error("Entity type not found in subgraph");
  }

  const properties: SimpleEntity["properties"] = {};
  for (const [propertyBaseUrl, propertyValue] of typedEntries(
    entity.properties,
  )) {
    const { propertyType } = getPropertyTypeForEntity(
      subgraph,
      entity.metadata.entityTypeId,
      propertyBaseUrl,
    );
    properties[propertyType.title] = propertyValue;
  }

  const entityUuid = extractEntityUuidFromEntityId(
    entity.metadata.recordId.entityId,
  );

  return {
    draft: !!extractDraftIdFromEntityId(entity.metadata.recordId.entityId),
    entityUuid,
    entityHref: `${frontendUrl}/@${shortname}/entities/${entityUuid}`,
    entityType: typeSchema.schema.title,
    properties,
  };
};

export const getSimpleGraph = (subgraph: Subgraph) => {
  const entities: SimpleEntity[] = [];
  const entityTypes: SimpleEntityType[] = [];

  const vertices = typedValues(subgraph.vertices)
    .map((vertex) => typedValues(vertex))
    .flat();

  for (const vertex of vertices) {
    if (vertex.kind === "entity") {
      if (vertex.inner.linkData) {
        /**
         * We add links under a 'links' property on the source entity, to make it easier for the model to identify
         * them.
         */
        continue;
      }

      /**
       * Resolve details of the entity type that the entity belongs to
       */
      const entityType = entityTypes.find(
        (type) => type.entityTypeId === vertex.inner.metadata.entityTypeId,
      );
      if (!entityType) {
        const simpleType = getSimpleEntityType(
          subgraph,
          vertex.inner.metadata.entityTypeId,
        );
        entityTypes.push(simpleType);
      }

      /**
       * Create the entity object
       */
      const baseFields = createBaseSimpleEntityFields(
        subgraph,
        vertex.inner,
        web.name,
      );

      const links: SimpleEntity["links"] = [];
      const linksFromEntity = getOutgoingLinksForEntity(
        subgraph,
        vertex.inner.metadata.recordId.entityId,
      );
      for (const link of linksFromEntity) {
        if (!link.linkData) {
          throw new Error(
            `Link with entityId ${link.metadata.recordId.entityId} has no linkData`,
          );
        }
        links.push({
          /** @todo account for link being in a different web to the source entity */
          ...createBaseSimpleEntityFields(subgraph, link, web.name),
          targetEntityUuid: extractEntityUuidFromEntityId(
            link.linkData.rightEntityId,
          ),
        });
      }

      const entity = {
        ...baseFields,
        links,
        webUuid: webOwnedById,
      };

      entities.push(entity);
    }
  }

  return {
    entities,
    entityTypes,
  };
};
