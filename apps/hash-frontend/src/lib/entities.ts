import {
  Entity,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
} from "@local/hash-types";
import {
  getEntityTypeById,
  getPropertyTypesByBaseUri,
  getRoots,
} from "@local/hash-types/stdlib";

/**
 * Generate a display label for an entity
 * Prefers the BP-specified labelProperty if it exists.
 * @see https://blockprotocol.org/docs/spec/graph-service-specification#json-schema-extensions
 */
export const generateEntityLabel = (
  entitySubgraph:
    | Subgraph<EntityRootType>
    | Partial<{ entityId: string; properties: any }>,
  entity?: Entity,
): string => {
  /**
   * @todo - this return type is only added to allow for incremental migration. It should be removed
   *   https://app.asana.com/0/0/1203157172269854/f
   */
  if (!("roots" in entitySubgraph)) {
    throw new Error("expected Subgraph but got a deprecated response type");
  }

  const entityToLabel = entity ?? getRoots(entitySubgraph)[0]!;

  const getFallbackLabel = () => {
    // fallback to the entity type and a few characters of the entityUuid
    const entityId = entityToLabel.metadata.recordId.entityId;

    const entityType = getEntityTypeById(
      entitySubgraph,
      entityToLabel.metadata.entityTypeId,
    );
    const entityTypeName = entityType?.schema.title ?? "Entity";

    return `${entityTypeName}-${extractEntityUuidFromEntityId(entityId).slice(
      0,
      5,
    )}`;
  };

  const getFallbackIfNotString = (val: any) => {
    if (!val || typeof val !== "string") {
      return getFallbackLabel();
    }

    return val;
  };

  // fallback to some likely display name properties
  const options = [
    "name",
    "preferred name",
    "display name",
    "title",
    "shortname",
  ];

  const propertyTypes: { title?: string; propertyTypeBaseUri: string }[] =
    Object.keys(entityToLabel.properties).map((propertyTypeBaseUri) => {
      /** @todo - pick the latest version rather than first element? */
      const [propertyType] = getPropertyTypesByBaseUri(
        entitySubgraph,
        propertyTypeBaseUri,
      );

      return propertyType
        ? {
            title: propertyType.schema.title.toLowerCase(),
            propertyTypeBaseUri,
          }
        : {
            title: undefined,
            propertyTypeBaseUri,
          };
    });

  for (const option of options) {
    const found = propertyTypes.find(({ title }) => title === option);

    if (found) {
      return getFallbackIfNotString(
        entityToLabel.properties[found.propertyTypeBaseUri],
      );
    }
  }

  return getFallbackLabel();
};
