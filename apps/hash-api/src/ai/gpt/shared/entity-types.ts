import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import type { Subgraph } from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPropertyTypeById,
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
   * The properties that entities of this type may have – the keys are the property titles, and the values are the property
   * descriptions.
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
