import { typedKeys } from "@local/advanced-types/typed-entries";
import {
  BaseUrl,
  Entity,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPropertyTypesByBaseUrl,
  getRoots,
} from "@local/hash-subgraph/stdlib";

/**
 * Generate a display label for an entity
 * Prefers the BP-specified labelProperty if it exists.
 * @see https://blockprotocol.org/docs/spec/graph-service-specification#json-schema-extensions
 */
export const generateEntityLabel = (
  entitySubgraph: Subgraph<EntityRootType>,
  entity?: Entity,
): string => {
  const entityToLabel: Entity = entity ?? getRoots(entitySubgraph)[0]!;

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
    "file name",
    "original file name",
  ];

  const propertyTypes: { title?: string; propertyTypeBaseUrl: BaseUrl }[] =
    typedKeys(entityToLabel.properties).map((propertyTypeBaseUrl) => {
      /** @todo - pick the latest version rather than first element? */
      const [propertyType] = getPropertyTypesByBaseUrl(
        entitySubgraph,
        propertyTypeBaseUrl,
      );

      return propertyType
        ? {
            title: propertyType.schema.title.toLowerCase(),
            propertyTypeBaseUrl,
          }
        : {
            title: undefined,
            propertyTypeBaseUrl,
          };
    });

  for (const option of options) {
    const found = propertyTypes.find(
      ({ title }) => title && title.toLowerCase() === option.toLowerCase(),
    );

    if (found) {
      return getFallbackIfNotString(
        entityToLabel.properties[found.propertyTypeBaseUrl],
      );
    }
  }

  return getFallbackLabel();
};
