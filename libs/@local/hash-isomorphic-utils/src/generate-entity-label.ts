import {
  getBreadthFirstEntityTypesAndParents,
  getEntityRevision,
} from "@blockprotocol/graph/stdlib";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
} from "@local/hash-graph-sdk/entity";

import { simplifyProperties } from "./simplify-properties.js";

import type { Subgraph } from "@blockprotocol/graph";
import type {
  BaseUrl,
  ClosedMultiEntityType,
  EntityMetadata,
  EntityTypeWithMetadata,
  PartialEntityType,
  Property,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

const getLabelPropertyValue = (
  entity: {
    properties: HashEntity["properties"];
  },
  labelProperty: BaseUrl | undefined,
): string | undefined => {
  if (labelProperty === undefined) {
    return undefined;
  }

  const label = entity.properties[labelProperty];

  /** A missing, empty or falsy value is not a label */
  if (
    label === undefined ||
    label === null ||
    label === false ||
    label === 0 ||
    label === ""
  ) {
    return undefined;
  }

  if (typeof label === "object") {
    return JSON.stringify(label);
  }

  return label.toString();
};

const hexCharsStart = -4;
const hexCharsEnd = -1;

const getHexSuffix = (entityUuid: string): string => {
  if (entityUuid.toLowerCase() === "draft") {
    return "-draft";
  }

  return `-${entityUuid.slice(hexCharsStart, hexCharsEnd)}`;
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
}): string => {
  // fallback to the entity type and a few characters of the entityUuid
  const entityId = entity.metadata.recordId.entityId;

  const entityTypeName = entityTypeTitle ?? "Entity";

  const entityUuid = extractEntityUuidFromEntityId(entityId);

  if (!includeHexChars) {
    return entityTypeName;
  }

  return `${entityTypeName}${getHexSuffix(entityUuid)}`;
};

interface LabelEntity {
  properties: HashEntity["properties"];
  metadata: Pick<EntityMetadata, "recordId" | "entityTypeIds">;
}

interface TypeDataLookup {
  entityTypeTitle: string | undefined;
  label: string | undefined;
}

const getInitialEntityTypeTitle = (
  typeData: Subgraph | ClosedMultiEntityType | PartialEntityType,
): string | undefined => {
  if ("title" in typeData) {
    return typeData.title;
  }

  if ("allOf" in typeData) {
    return typeData.allOf[0].title;
  }

  return undefined;
};

/**
 * This is a subgraph, we need to find the type information in it
 */
const lookUpLabelInSubgraph = (
  subgraph: Subgraph,
  entity: LabelEntity,
  initialEntityTypeTitle: string | undefined,
): TypeDataLookup => {
  let entityTypesAndAncestors: EntityTypeWithMetadata[] = [];
  let entityTypeTitle = initialEntityTypeTitle;

  try {
    entityTypesAndAncestors = getBreadthFirstEntityTypesAndParents(
      subgraph,
      entity.metadata.entityTypeIds,
    );

    entityTypeTitle = entityTypesAndAncestors[0]?.schema.title;
  } catch (error) {
    let message = String(error);

    if (error instanceof Error) {
      message = error.message;
    }

    // eslint-disable-next-line no-console -- prefer not to crash here but still have some feedback that there's an issue
    console.error(
      `Error looking for entity type and ancestors in provided subgraph: ${message}}`,
    );
  }

  for (const typeToCheck of entityTypesAndAncestors) {
    const label = getLabelPropertyValue(
      entity,
      typeToCheck.schema.labelProperty,
    );

    if (label !== undefined) {
      return { entityTypeTitle, label };
    }
  }

  return { entityTypeTitle, label: undefined };
};

const lookUpLabelInTypeData = (
  typeData: Subgraph | ClosedMultiEntityType | PartialEntityType | null,
  entity: LabelEntity,
): TypeDataLookup => {
  if (typeData === null) {
    return { entityTypeTitle: undefined, label: undefined };
  }

  const entityTypeTitle = getInitialEntityTypeTitle(typeData);

  if ("roots" in typeData) {
    return lookUpLabelInSubgraph(typeData, entity, entityTypeTitle);
  }

  if ("title" in typeData) {
    /**
     * This is a PartialEntityType, which are provided alongside ClosedEntityType definitions,
     * and represent the possible link destinations of a closed type.
     */
    return {
      entityTypeTitle,
      label: getLabelPropertyValue(entity, typeData.labelProperty),
    };
  }

  /**
   * This is a closed multi-entity-type
   */
  const { labelProperty } = getDisplayFieldsForClosedEntityType(typeData);

  return {
    entityTypeTitle,
    label: getLabelPropertyValue(entity, labelProperty),
  };
};

/** The value of a property, if it is a non-empty string */
const getStringProperty = (
  properties: Record<string, Property>,
  key: string,
): string | undefined => {
  const value = properties[key];

  return typeof value === "string" && value !== "" ? value : undefined;
};

// fallback to some likely display name properties
const displayNameProperties = [
  "name",
  "preferredName",
  "displayName",
  "title",
  "organizationName",
  "shortname",
  "fileName",
  "originalFileName",
];

const getLikelyDisplayName = (
  properties: Record<string, Property>,
): string | undefined => {
  for (const option of displayNameProperties) {
    const value = getStringProperty(properties, option);

    if (value !== undefined) {
      return value;
    }
  }

  const firstName = getStringProperty(properties, "firstName");

  const lastName =
    getStringProperty(properties, "lastName") ??
    getStringProperty(properties, "familyName");

  if (firstName !== undefined && lastName !== undefined) {
    return `${firstName} ${lastName}`;
  }

  return firstName ?? lastName;
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
  entity: LabelEntity,
  // oxlint-disable-next-line hash/prefer-options-object -- public positional signature used across the monorepo
  includeHexChars = true,
): string => {
  if (!("properties" in entity)) {
    throw new Error("No 'properties' object found in entity to label");
  }

  const { entityTypeTitle, label } = lookUpLabelInTypeData(typeData, entity);

  if (label !== undefined) {
    return label;
  }

  // SAFETY: simplifyProperties returns the entity's properties with their values unwrapped; only the key type is widened
  const simplifiedProperties = simplifyProperties(entity.properties) as Record<
    string,
    Property
  >;

  const displayName = getLikelyDisplayName(simplifiedProperties);

  if (displayName !== undefined) {
    return displayName;
  }

  return getFallbackLabel({
    entityTypeTitle,
    entity,
    includeHexChars,
  });
};

interface ClosedTypeData {
  closedType: ClosedMultiEntityType;
  entityTypeDefinitions: ClosedMultiEntityTypesDefinitions;
  closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap;
}

const resolveEntityType = ({
  closedTypeData,
  entitySubgraph,
  entityTypeIds,
}: {
  closedTypeData: ClosedTypeData | null;
  entitySubgraph: Subgraph;
  entityTypeIds: EntityMetadata["entityTypeIds"];
}): PartialEntityType | ClosedMultiEntityType | Subgraph | undefined => {
  if (closedTypeData === null) {
    return entitySubgraph;
  }

  try {
    return getClosedMultiEntityTypeFromMap(
      closedTypeData.closedMultiEntityTypesRootMap,
      entityTypeIds,
    );
  } catch {
    return closedTypeData.entityTypeDefinitions.entityTypes[entityTypeIds[0]];
  }
};

export const generateLinkEntityLabel = (
  entitySubgraph: Subgraph,
  entity: {
    linkData: HashEntity["linkData"];
    properties: HashEntity["properties"];
    metadata: Pick<EntityMetadata, "recordId" | "entityTypeIds">;
  },
  closedTypeData: ClosedTypeData | null,
): string => {
  const entityLabel = generateEntityLabel(
    closedTypeData?.closedType ?? entitySubgraph,
    entity,
    false,
  );

  if (entity.linkData === undefined) {
    return entityLabel;
  }

  const leftEntity = getEntityRevision(
    entitySubgraph,
    entity.linkData.leftEntityId,
  );
  if (leftEntity === undefined) {
    return entityLabel;
  }

  const rightEntity = getEntityRevision(
    entitySubgraph,
    entity.linkData.rightEntityId,
  );
  if (rightEntity === undefined) {
    return entityLabel;
  }

  const typeForLeftEntity = resolveEntityType({
    closedTypeData,
    entitySubgraph,
    entityTypeIds: leftEntity.metadata.entityTypeIds,
  });
  const typeForRightEntity = resolveEntityType({
    closedTypeData,
    entitySubgraph,
    entityTypeIds: rightEntity.metadata.entityTypeIds,
  });

  if (typeForLeftEntity === undefined || typeForRightEntity === undefined) {
    throw new Error(
      `Type definitions for left or right entity not found in closed type data`,
    );
  }

  const leftLabel = generateEntityLabel(typeForLeftEntity, leftEntity, false);
  const rightLabel = generateEntityLabel(
    typeForRightEntity,
    rightEntity,
    false,
  );

  return `${leftLabel} - ${entityLabel} - ${rightLabel}`;
};
