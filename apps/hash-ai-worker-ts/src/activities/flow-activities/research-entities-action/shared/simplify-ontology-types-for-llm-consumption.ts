import type {
  DereferencedEntityType,
  DereferencedPropertyType,
  MinimalPropertyTypeValue,
} from "../../../shared/dereference-entity-type";

const simplifyMinimalPropertyTypeValueForLlmConsumption = (params: {
  propertyTypeValue: MinimalPropertyTypeValue;
}) => {
  const { propertyTypeValue } = params;

  /** @todo: devise a simplified format for property values */
  return JSON.stringify(propertyTypeValue);
};

const simplifyPropertyTypeForLlmConsumption = (params: {
  propertyType: DereferencedPropertyType;
}) => {
  const { propertyType } = params;

  const { title, description } = propertyType;

  return `
-------------------- START OF "${title}" PROPERTY TYPE DEFINITION --------------------
Title: ${title}
Description: ${description}
Possible Values: ${propertyType.oneOf.map((propertyTypeValue) => simplifyMinimalPropertyTypeValueForLlmConsumption({ propertyTypeValue })).join("\n")}
----------------------- END OF "${title}" PROPERTY TYPE DEFINITION --------------------
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
-------------------- START OF "${title}" ENTITY TYPE DEFINITION --------------------
Title: ${title}
Description: ${description}
Properties:
${propertyTypes
  .map((propertyType) =>
    simplifyPropertyTypeForLlmConsumption({ propertyType }),
  )
  .join("\n")}
Outgoing Links:
-------------------- END OF "${title}" ENTITY TYPE DEFINITION --------------------
  `;
};
