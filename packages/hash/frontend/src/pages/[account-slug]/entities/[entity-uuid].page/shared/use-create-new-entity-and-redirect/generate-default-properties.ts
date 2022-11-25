import { EntityType } from "@blockprotocol/type-system-web";
import { PropertyObject, Subgraph } from "@hashintel/hash-subgraph";
import { getPropertyTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/property-type";
import { getDefaultValueOfPropertyType } from "./get-default-value-of-property-type";

/**
 * @todo this will be deleted when https://app.asana.com/0/1203312852763953/1203433085114587/f (internal) is implemented
 */
export const generateDefaultProperties = (
  properties: EntityType["properties"],
  subgraph: Subgraph,
) => {
  const result: PropertyObject = {};

  for (const propertyKey of Object.keys(properties)) {
    const property = properties[propertyKey];

    if (property) {
      const propertyTypeId =
        "$ref" in property ? property.$ref : property.items.$ref;

      const propertyType = getPropertyTypeById(
        subgraph,
        propertyTypeId,
      )?.schema;

      result[propertyKey] = getDefaultValueOfPropertyType(
        propertyType!,
        subgraph,
      );
    }
  }

  return result;
};
