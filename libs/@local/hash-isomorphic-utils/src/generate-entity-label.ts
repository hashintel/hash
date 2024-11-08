import type { EntityType } from "@blockprotocol/type-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityMetadata, Property } from "@local/hash-graph-types/entity";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getBreadthFirstEntityTypesAndParents,
  getEntityRevision,
  getRoots,
} from "@local/hash-subgraph/stdlib";

import { simplifyProperties } from "./simplify-properties.js";

const getLabelPropertyValue = (
  entityToLabel: {
    properties: Entity["properties"];
  },
  entityType: EntityType,
) => {
  if (entityType.labelProperty) {
    const label = entityToLabel.properties[entityType.labelProperty as BaseUrl];

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
  includeHexChars,
}: {
  entityType?: EntityType;
  entity: {
    properties: Entity["properties"];
    metadata: Pick<EntityMetadata, "recordId" | "entityTypeIds">;
  };
  includeHexChars: boolean;
}) => {
  // fallback to the entity type and a few characters of the entityUuid
  const entityId = entity.metadata.recordId.entityId;

  const entityTypeName = entityType?.title ?? "Entity";

  return `${entityTypeName}${
    includeHexChars
      ? `-${extractEntityUuidFromEntityId(entityId).slice(-4, -1)}`
      : ""
  }`;
};

export function generateEntityLabel(
  entitySubgraph: Subgraph<EntityRootType>,
  entity?: {
    properties: Entity["properties"];
    metadata: Pick<EntityMetadata, "recordId" | "entityTypeIds">;
  },
  includeHexChars?: boolean,
): string;
export function generateEntityLabel(
  entitySubgraph: Subgraph | null,
  entity: {
    properties: Entity["properties"];
    metadata: Pick<EntityMetadata, "recordId" | "entityTypeIds">;
  },
  includeHexChars?: boolean,
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
    metadata: Pick<EntityMetadata, "recordId" | "entityTypeIds">;
  },
  includeHexChars: boolean = true,
): string {
  if (!entitySubgraph && !entity) {
    throw new Error(`One of entitySubgraph or entity must be provided`);
  }
  const entityToLabel = entity ?? getRoots(entitySubgraph!)[0]!;

  if (!("properties" in entityToLabel)) {
    throw new Error("No 'properties' object found in entity to label");
  }

  let entityType: EntityTypeWithMetadata | undefined;
  if (entitySubgraph) {
    let entityTypesAndAncestors: EntityTypeWithMetadata[] | undefined;
    try {
      entityTypesAndAncestors = getBreadthFirstEntityTypesAndParents(
        entitySubgraph,
        entityToLabel.metadata.entityTypeIds,
      );

      entityType = entityTypesAndAncestors[0];
    } catch (error) {
      // eslint-disable-next-line no-console -- prefer not to crash here but still have some feedback that there's an issue
      console.error(
        `Error looking for entity type and ancestors in provided subgraph: ${
          (error as Error).message
        }}`,
      );
    }

    for (const typeToCheck of entityTypesAndAncestors ?? []) {
      const label = getLabelPropertyValue(entityToLabel, typeToCheck.schema);

      if (label) {
        return label;
      }
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

  return getFallbackLabel({
    entityType: entityType?.schema,
    entity: entityToLabel,
    includeHexChars,
  });
}

export const generateLinkEntityLabel = (
  entitySubgraph: Subgraph,
  entity: {
    linkData: Entity["linkData"];
    properties: Entity["properties"];
    metadata: Pick<EntityMetadata, "recordId" | "entityTypeIds">;
  },
) => {
  const entityLabel = generateEntityLabel(entitySubgraph, entity, false);

  if (!entity.linkData) {
    return entityLabel;
  }

  const leftEntity = getEntityRevision(
    entitySubgraph,
    entity.linkData.leftEntityId,
  );
  if (!leftEntity) {
    return entityLabel;
  }

  const rightEntity = getEntityRevision(
    entitySubgraph,
    entity.linkData.rightEntityId,
  );
  if (!rightEntity) {
    return entityLabel;
  }

  const leftLabel = generateEntityLabel(entitySubgraph, leftEntity);
  const rightLabel = generateEntityLabel(entitySubgraph, rightEntity);

  return `${leftLabel} - ${entityLabel} - ${rightLabel}`;
};
