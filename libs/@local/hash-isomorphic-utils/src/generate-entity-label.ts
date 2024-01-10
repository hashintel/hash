import type { EntityPropertyValue } from "@blockprotocol/graph";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  Entity,
  EntityRootType,
  EntityTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getEntityTypeAndParentsById,
  getRoots,
} from "@local/hash-subgraph/stdlib";

const getLabelPropertyValue = (
  entityToLabel: Entity,
  entityType: EntityTypeWithMetadata,
) => {
  if (entityType.metadata.labelProperty) {
    const label = entityToLabel.properties[entityType.metadata.labelProperty];

    if (label) {
      return label.toString();
    }
  }
};

const getFallbackLabel = ({
  entityType,
  entity,
}: {
  entityType?: EntityTypeWithMetadata;
  entity: Entity;
}) => {
  // fallback to the entity type and a few characters of the entityUuid
  const entityId = entity.metadata.recordId.entityId;

  const entityTypeName = entityType?.schema.title ?? "Entity";

  return `${entityTypeName}-${extractEntityUuidFromEntityId(entityId).slice(
    0,
    5,
  )}`;
};

/**
 * Generate a display label for an entity
 * Prefers the BP-specified labelProperty if it exists.
 * @see https://blockprotocol.org/docs/spec/graph-service-specification#json-schema-extensions
 */
export const generateEntityLabel = (
  entitySubgraph: Subgraph<EntityRootType> | null,
  entity?: Entity,
): string => {
  if (!entitySubgraph && !entity) {
    throw new Error(`One of entitySubgraph or entity must be provided`);
  }
  const entityToLabel: Entity = entity ?? getRoots(entitySubgraph!)[0]!;

  let entityType: EntityTypeWithMetadata | undefined;
  if (entitySubgraph) {
    let entityTypeAndAncestors: EntityTypeWithMetadata[] | undefined;
    try {
      entityTypeAndAncestors = getEntityTypeAndParentsById(
        entitySubgraph,
        entityToLabel.metadata.entityTypeId,
      );

      entityType = entityTypeAndAncestors[0];
    } catch (error) {
      // eslint-disable-next-line no-console -- prefer not to crash here but still have some feedback that there's an issue
      console.error(
        `Error looking for entity type and ancestors in provided subgraph: ${
          (error as Error).message
        }}`,
      );
    }

    const entityTypesToCheck = entityType ? [entityType] : [];

    /**
     * Return any truthy value for a property which is set as the labelProperty for the entity's type,
     * or any of its ancestors, using a breadth-first search in the inheritance tree starting from the entity's own type.
     */
    for (let i = 0; i < entityTypesToCheck.length; i++) {
      const typeToCheck = entityTypesToCheck[i]!;

      const label = getLabelPropertyValue(entityToLabel, typeToCheck);

      if (label) {
        return label;
      }

      entityTypesToCheck.push(
        ...(entityTypeAndAncestors ?? []).filter(
          (type) =>
            typeToCheck.schema.allOf?.find(
              ({ $ref }) => $ref === type.schema.$id,
            ),
        ),
      );
    }
  }

  const simplifiedProperties = simplifyProperties(
    entityToLabel.properties,
  ) as Record<string, EntityPropertyValue>;

  // fallback to some likely display name properties
  const options = [
    "name",
    "preferredName",
    "displayName",
    "title",
    "organizationName",
    "shortname",
    "fileName",
    "originalFileName",
  ];

  for (const option of options) {
    if (
      simplifiedProperties[option] &&
      typeof simplifiedProperties[option] === "string"
    ) {
      return simplifiedProperties[option] as string;
    }
  }

  return getFallbackLabel({ entityType, entity: entityToLabel });
};
