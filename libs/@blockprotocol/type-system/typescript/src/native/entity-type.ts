import { EntityType, VersionedUrl } from "../../wasm/type-system";

export const ENTITY_TYPE_META_SCHEMA: EntityType["$schema"] =
  "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type";

/**
 * Returns all the IDs of all types referenced in a given property type.
 *
 * @param {EntityType} entityType
 */
export const getReferencedIdsFromEntityType = (
  entityType: EntityType,
): {
  constrainsPropertiesOnPropertyTypes: VersionedUrl[];
  constrainsLinksOnEntityTypes: VersionedUrl[];
  constrainsLinkDestinationsOnEntityTypes: VersionedUrl[];
  inheritsFromEntityTypes: VersionedUrl[];
} => {
  const constrainsPropertiesOnPropertyTypes: Set<VersionedUrl> = new Set();
  const constrainsLinksOnEntityTypes: Set<VersionedUrl> = new Set();
  const constrainsLinkDestinationsOnEntityTypes: Set<VersionedUrl> = new Set();
  const inheritsFromEntityTypes: VersionedUrl[] = [];

  for (const propertyDefinition of Object.values(entityType.properties)) {
    if ("items" in propertyDefinition) {
      constrainsPropertiesOnPropertyTypes.add(propertyDefinition.items.$ref);
    } else {
      constrainsPropertiesOnPropertyTypes.add(propertyDefinition.$ref);
    }
  }
  for (const inheritedEntityType of entityType.allOf ?? []) {
    inheritsFromEntityTypes.push(inheritedEntityType.$ref);
  }

  for (const [linkTypeId, linkDefinition] of Object.entries(
    entityType.links ?? {},
  )) {
    /** @todo - if we had the `typedEntries` helper here we wouldn't need this cast */
    constrainsLinksOnEntityTypes.add(linkTypeId as VersionedUrl);

    if ("items" in linkDefinition && "oneOf" in linkDefinition.items) {
      for (const ele of linkDefinition.items.oneOf.map(
        (oneOfEntry) => oneOfEntry.$ref,
      )) {
        constrainsLinkDestinationsOnEntityTypes.add(ele);
      }
    }
  }

  return {
    constrainsPropertiesOnPropertyTypes: [
      ...constrainsPropertiesOnPropertyTypes,
    ],
    constrainsLinksOnEntityTypes: [...constrainsLinksOnEntityTypes],
    constrainsLinkDestinationsOnEntityTypes: [
      ...constrainsLinkDestinationsOnEntityTypes,
    ],
    inheritsFromEntityTypes: [...inheritsFromEntityTypes],
  };
};
