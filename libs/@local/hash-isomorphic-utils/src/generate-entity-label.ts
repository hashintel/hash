import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityMetadata, Property } from "@local/hash-graph-types/entity";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getEntityTypeAndParentsById,
  getRoots,
} from "@local/hash-subgraph/stdlib";

import { simplifyProperties } from "./simplify-properties.js";
import { isEntity } from "@local/hash-isomorphic-utils/entity-store";

const getLabelPropertyValue = (
  entityToLabel: {
    properties: Entity["properties"];
    metadata: EntityMetadata;
  },
  entityType: EntityTypeWithMetadata,
) => {
  if (entityType.metadata.labelProperty) {
    const label = entityToLabel.properties[entityType.metadata.labelProperty];

    if (label) {
      return label && typeof label === "object"
        ? JSON.stringify(label)
        : label.toString();
    }
  }
};

const getFallbackLabel = ({
  entityType,
  entity,
}: {
  entityType?: EntityTypeWithMetadata;
  entity: { properties: Entity["properties"]; metadata: EntityMetadata };
}) => {
  // fallback to the entity type and a few characters of the entityUuid
  const entityId = entity.metadata.recordId.entityId;

  const entityTypeName = entityType?.schema.title ?? "Entity";

  return `${entityTypeName}-${extractEntityUuidFromEntityId(entityId).slice(
    0,
    5,
  )}`;
};

export function generateEntityLabel(
  entitySubgraph: Subgraph<EntityRootType>,
  entity?: {
    properties: Entity["properties"];
    metadata: Pick<EntityMetadata, "recordId">;
  },
): string;
export function generateEntityLabel(
  entitySubgraph: Subgraph | null,
  entity: {
    properties: Entity["properties"];
    metadata: Pick<EntityMetadata, "recordId">;
  },
): string;
/**
 * Generate a display label for an entity
 * Prefers the BP-specified labelProperty if it exists.
 * @see https://blockprotocol.org/docs/spec/graph-service-specification#json-schema-extensions
 *
 * If 'entity' is not provided, the Subgraph must be entity-rooted, and the first root is taken as the entity.
 * Otherwise, the subgraph need only contain the types for the entity.
 */
export function generateEntityLabel(
  entitySubgraph: Subgraph | null,
  entity?: {
    properties: Entity["properties"];
    metadata: Pick<EntityMetadata, "recordId">;
  },
): string {
  if (!entitySubgraph && !entity) {
    throw new Error(`One of entitySubgraph or entity must be provided`);
  }
  const entityToLabel = entity ?? getRoots(entitySubgraph!)[0]!;

  if (!isEntity(entityToLabel)) {
    throw new Error(
      `Either one of 'entity' or an entity rooted subgraph must be provided`,
    );
  }

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
        ...(entityTypeAndAncestors ?? []).filter((type) =>
          typeToCheck.schema.allOf?.find(
            ({ $ref }) => $ref === type.schema.$id,
          ),
        ),
      );
    }
  }

  const simplifiedProperties = simplifyProperties(
    entityToLabel.properties,
  ) as Record<string, Property>;

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
      return simplifiedProperties[option];
    }
  }

  const firstName =
    simplifiedProperties.firstName &&
    typeof simplifiedProperties.firstName === "string"
      ? simplifiedProperties.firstName
      : undefined;

  const lastName =
    simplifiedProperties.lastName &&
    typeof simplifiedProperties.lastName === "string"
      ? simplifiedProperties.lastName
      : simplifiedProperties.familyName &&
          typeof simplifiedProperties.familyName === "string"
        ? simplifiedProperties.familyName
        : undefined;

  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  } else if (firstName) {
    return firstName;
  } else if (lastName) {
    return lastName;
  }

  return getFallbackLabel({ entityType, entity: entityToLabel });
}
