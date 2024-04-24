import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  typedEntries,
  typedKeys,
  typedValues,
} from "@local/advanced-types/typed-entries";
import type { Entity, EntityId, Subgraph } from "@local/hash-subgraph";
import {
  extractDraftIdFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getOutgoingLinksForEntity,
  getPropertyTypeById,
  getPropertyTypeForEntity,
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
  entityId: EntityId;
  /** The title of the entity type this entity belongs to */
  entityType: string;
  /** The properties of the entity, with the property title as the key */
  properties: Record<string, unknown>;
  /** A link to view full details of the entity which users can follow to find out more */
  entityHref?: string;
  /**
   * The web that the entity belongs to
   */
  webUuid: string;
};

export type SimpleLinkWithoutHref = BaseSimpleEntityFields & {
  /** The unique entityId of the target of this link. */
  targetEntityId: string;
};

export type SimpleEntityWithoutHref = BaseSimpleEntityFields & {
  /**
   * Links from the entity to other entities. The link itself can have properties, containing data about the
   * relationship.
   */
  links: SimpleLinkWithoutHref[];
};

const createBaseSimpleEntityFields = (
  subgraph: Subgraph,
  entity: Entity,
): BaseSimpleEntityFields => {
  const typeSchema = getEntityTypeById(subgraph, entity.metadata.entityTypeId);
  if (!typeSchema) {
    throw new Error("Entity type not found in subgraph");
  }

  const properties: SimpleEntityWithoutHref["properties"] = {};
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

  const ownedById = extractOwnedByIdFromEntityId(
    entity.metadata.recordId.entityId,
  );

  return {
    draft: !!extractDraftIdFromEntityId(entity.metadata.recordId.entityId),
    entityId: entity.metadata.recordId.entityId,
    entityType: typeSchema.schema.title,
    properties,
    webUuid: ownedById,
  };
};

export const getSimpleGraph = (subgraph: Subgraph) => {
  const entities: SimpleEntityWithoutHref[] = [];
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
      const baseFields = createBaseSimpleEntityFields(subgraph, vertex.inner);

      const links: SimpleEntityWithoutHref["links"] = [];
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
          ...createBaseSimpleEntityFields(subgraph, link),
          targetEntityId: link.linkData.rightEntityId,
        });
      }

      const entity = {
        ...baseFields,
        links,
      };

      entities.push(entity);
    }
  }

  return {
    entities,
    entityTypes,
  };
};
