import type {
  LocalOrExistingEntityId,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/flows/types";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";

import type {
  DereferencedEntityType,
  DereferencedPropertyType,
  MinimalPropertyTypeValue,
} from "../../../shared/dereference-entity-type";

const simplifyMinimalPropertyTypeValueForLlmConsumption = (params: {
  propertyTypeValue: MinimalPropertyTypeValue;
}) => {
  const { propertyTypeValue } = params;

  /**
   * @todo: devise a simplified format for property values
   *
   * @see https://linear.app/hash/issue/H-2826/simplify-property-values-for-llm-consumption
   */
  return JSON.stringify(propertyTypeValue);
};

const simplifyPropertyTypeForLlmConsumption = (params: {
  propertyType: DereferencedPropertyType;
}) => {
  const { propertyType } = params;

  const { title, description } = propertyType;

  return `
<${title}Property>
Property Type ID: "${propertyType.$id}"
Title: ${title}
Description: ${description}
Possible Values: ${propertyType.oneOf
    .map((propertyTypeValue) =>
      simplifyMinimalPropertyTypeValueForLlmConsumption({ propertyTypeValue }),
    )
    .join("\n")}
</${title}Property>
  `;
};

export const simplifyEntityTypeForLlmConsumption = (params: {
  entityType: DereferencedEntityType<string>;
}) => {
  const { entityType } = params;

  const { title, description, properties } = entityType;

  const propertyTypes = Object.values(properties).map((propertyValue) =>
    "items" in propertyValue ? propertyValue.items : propertyValue,
  );

  return `
<${title}EntityType>
Entity Type ID: "${entityType.$id}"
Title: ${title}
Description: ${description}
Properties:
${propertyTypes
  .map((propertyType) =>
    simplifyPropertyTypeForLlmConsumption({ propertyType }),
  )
  .join("\n")}
</${title}EntityType>
  `;
};

// This assumes a hash.ai/blockprotocol.org type URL format ending in [slugified-title]/v/[number]
const slugToTitleCase = (slug?: string) =>
  slug
    ? slug
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    : undefined;

const getIdForLinkEndpoint = (endpoint: LocalOrExistingEntityId) =>
  endpoint.kind === "existing-entity" ? endpoint.entityId : endpoint.localId;

export const simplifyProposedEntityForLlmConsumption = (params: {
  proposedEntity: ProposedEntity;
}) => {
  const { proposedEntity } = params;

  const {
    entityTypeId,
    localEntityId,
    sourceEntityId,
    targetEntityId,
    properties,
  } = proposedEntity;

  return `
<Entity>
EntityId: ${localEntityId}
EntityType: ${slugToTitleCase(entityTypeId)}
Properties:
${Object.entries(properties)
  .map(
    ([baseUrl, value]) =>
      `${slugToTitleCase(baseUrl)}: ${stringifyPropertyValue(value)}`,
  )
  .join("\n")}
    ${
      sourceEntityId && targetEntityId
        ? `\n<LinkData>SourceEntityId: ${getIdForLinkEndpoint(sourceEntityId)}\nTargetEntityId: ${getIdForLinkEndpoint(targetEntityId)}</LinkData>`
        : ""
    }
</Entity>
  `;
};
