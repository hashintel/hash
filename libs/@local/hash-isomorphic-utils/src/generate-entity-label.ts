import type { Subgraph } from "@blockprotocol/graph";
import {
  getBreadthFirstEntityTypesAndParents,
  getEntityRevision,
} from "@blockprotocol/graph/stdlib";
import type {
  BaseUrl,
  ClosedMultiEntityType,
  EntityMetadata,
  EntityTypeWithMetadata,
  PartialEntityType,
  Property,
} from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
} from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

import { simplifyProperties } from "./simplify-properties.js";

const getLabelPropertyValue = (
  entity: {
    properties: HashEntity["properties"];
  },
  labelProperty: BaseUrl | undefined,
) => {
  if (labelProperty) {
    const label = entity.properties[labelProperty];

    if (label) {
      return label && typeof label === "object"
        ? JSON.stringify(label)
        : label.toString();
    }
  }
};

const getFallbackLabel = ({
  entityTypeTitle,
  entity,
  includeHexChars,
}: {
  entityTypeTitle?: string;
  entity: {
    properties: HashEntity["properties"];
    metadata: Pick<EntityMetadata, "recordId" | "entityTypeIds">;
  };
  includeHexChars: boolean;
}) => {
  // fallback to the entity type and a few characters of the entityUuid
  const entityId = entity.metadata.recordId.entityId;

  const entityTypeName = entityTypeTitle ?? "Entity";

  const entityUuid = extractEntityUuidFromEntityId(entityId);

  return `${entityTypeName}${
    includeHexChars
      ? `-${entityUuid.toLowerCase() === "draft" ? "draft" : entityUuid.slice(-4, -1)}`
      : ""
  }`;
};

/**
 * Generate a display label for an entity
 * Prefers the BP-specified labelProperty if it exists.
 * @see https://blockprotocol.org/docs/spec/graph-service-specification#json-schema-extensions
 *
 * If 'entity' is not provided, the Subgraph must be entity-rooted, and the first root is taken as the entity.
 * Otherwise, the subgraph need only contain the types for the entity.
 */
export const generateEntityLabel = (
  typeData: Subgraph | ClosedMultiEntityType | PartialEntityType | null,
  entity: {
    properties: HashEntity["properties"];
    metadata: Pick<EntityMetadata, "recordId" | "entityTypeIds">;
  },
  includeHexChars: boolean = true,
): string => {
  if (!("properties" in entity)) {
    throw new Error("No 'properties' object found in entity to label");
  }

  let entityTypeTitle: string | undefined;

  if (typeData && "title" in typeData) {
    entityTypeTitle = typeData.title;
  } else if (typeData && "allOf" in typeData) {
    entityTypeTitle = typeData.allOf[0].title;
  }

  if (typeData && "roots" in typeData) {
    /**
     * This is a subgraph, we need to find the type information in it
     */
    let entityTypesAndAncestors: EntityTypeWithMetadata[] | undefined;
    try {
      entityTypesAndAncestors = getBreadthFirstEntityTypesAndParents(
        typeData,
        entity.metadata.entityTypeIds,
      );

      entityTypeTitle = entityTypesAndAncestors[0]?.schema.title;
    } catch (error) {
      // eslint-disable-next-line no-console -- prefer not to crash here but still have some feedback that there's an issue
      console.error(
        `Error looking for entity type and ancestors in provided subgraph: ${
          (error as Error).message
        }}`,
      );
    }

    for (const typeToCheck of entityTypesAndAncestors ?? []) {
      const label = getLabelPropertyValue(
        entity,
        typeToCheck.schema.labelProperty,
      );

      if (label) {
        return label;
      }
    }
  } else if (typeData && "title" in typeData) {
    /**
     * This is a PartialEntityType, which are provided alongside ClosedEntityType definitions,
     * and represent the possible link destinations of a closed type.
     */
    const label = getLabelPropertyValue(entity, typeData.labelProperty);

    if (label) {
      return label;
    }
  } else if (typeData) {
    /**
     * This is a closed multi-entity-type
     */
    const { labelProperty } = getDisplayFieldsForClosedEntityType(typeData);

    const label = getLabelPropertyValue(entity, labelProperty);

    if (label) {
      return label;
    }
  }

  const simplifiedProperties = simplifyProperties(entity.properties) as Record<
    string,
    Property
  >;

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
    entityTypeTitle,
    entity,
    includeHexChars,
  });
};

export const generateLinkEntityLabel = (
  entitySubgraph: Subgraph,
  entity: {
    linkData: HashEntity["linkData"];
    properties: HashEntity["properties"];
    metadata: Pick<EntityMetadata, "recordId" | "entityTypeIds">;
  },
  closedTypeData: {
    closedType: ClosedMultiEntityType;
    entityTypeDefinitions: ClosedMultiEntityTypesDefinitions;
    closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap;
  } | null,
) => {
  const entityLabel = generateEntityLabel(
    closedTypeData?.closedType ?? entitySubgraph,
    entity,
    false,
  );

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

  let typeForLeftEntity:
    | PartialEntityType
    | ClosedMultiEntityType
    | Subgraph
    | undefined;
  let typeForRightEntity:
    | PartialEntityType
    | ClosedMultiEntityType
    | Subgraph
    | undefined;

  if (!closedTypeData) {
    typeForLeftEntity = entitySubgraph;
    typeForRightEntity = entitySubgraph;
  } else {
    try {
      typeForLeftEntity = getClosedMultiEntityTypeFromMap(
        closedTypeData.closedMultiEntityTypesRootMap,
        leftEntity.metadata.entityTypeIds,
      );
    } catch {
      typeForLeftEntity =
        closedTypeData.entityTypeDefinitions.entityTypes[
          leftEntity.metadata.entityTypeIds[0]
        ];
    }

    try {
      typeForRightEntity = getClosedMultiEntityTypeFromMap(
        closedTypeData.closedMultiEntityTypesRootMap,
        rightEntity.metadata.entityTypeIds,
      );
    } catch {
      typeForRightEntity =
        closedTypeData.entityTypeDefinitions.entityTypes[
          rightEntity.metadata.entityTypeIds[0]
        ];
    }

    if (!typeForLeftEntity || !typeForRightEntity) {
      throw new Error(
        `Type definitions for left or right entity not found in closed type data`,
      );
    }
  }

  const leftLabel = generateEntityLabel(typeForLeftEntity, leftEntity, false);
  const rightLabel = generateEntityLabel(
    typeForRightEntity,
    rightEntity,
    false,
  );

  return `${leftLabel} - ${entityLabel} - ${rightLabel}`;
};
