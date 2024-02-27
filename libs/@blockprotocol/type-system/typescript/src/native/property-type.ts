import {
  Array as TypeSystemArray,
  OneOf,
  PropertyType,
  PropertyValues,
  VersionedUrl,
} from "../../wasm/type-system";

export const PROPERTY_TYPE_META_SCHEMA: PropertyType["$schema"] =
  "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type";

/**
 * Type guard to determine if a given {@link PropertyValues} is an array definition.
 *
 * @param {PropertyValues} propertyValues
 */
export const isPropertyValuesArray = (
  propertyValues: PropertyValues,
): propertyValues is TypeSystemArray<OneOf<PropertyValues>> =>
  "type" in propertyValues && propertyValues.type === "array";

/**
 * Returns all the IDs of all types referenced in a given property type.
 *
 * @param {PropertyType} propertyType
 */
export const getReferencedIdsFromPropertyType = (
  propertyType: PropertyType,
): {
  constrainsValuesOnDataTypes: VersionedUrl[];
  constrainsPropertiesOnPropertyTypes: VersionedUrl[];
} => {
  const recurseOneOf = (oneOf: PropertyValues[]) => {
    const constrainsValuesOnDataTypes: Set<VersionedUrl> = new Set();
    const constrainsPropertiesOnPropertyTypes: Set<VersionedUrl> = new Set();

    for (const oneOfValue of oneOf) {
      if (isPropertyValuesArray(oneOfValue)) {
        const nestedIds = recurseOneOf(oneOfValue.items.oneOf);
        for (const ele of nestedIds.constrainsPropertiesOnPropertyTypes) {
          constrainsPropertiesOnPropertyTypes.add(ele);
        }
        for (const ele of nestedIds.constrainsValuesOnDataTypes) {
          constrainsValuesOnDataTypes.add(ele);
        }
      } else if ("properties" in oneOfValue) {
        // property type object definition
        for (const propertyDefinition of Object.values(oneOfValue.properties)) {
          if ("items" in propertyDefinition) {
            constrainsPropertiesOnPropertyTypes.add(
              propertyDefinition.items.$ref,
            );
          } else {
            constrainsPropertiesOnPropertyTypes.add(propertyDefinition.$ref);
          }
        }
      } else {
        // data type reference
        constrainsValuesOnDataTypes.add(oneOfValue.$ref);
      }
    }

    return { constrainsValuesOnDataTypes, constrainsPropertiesOnPropertyTypes };
  };

  const { constrainsValuesOnDataTypes, constrainsPropertiesOnPropertyTypes } =
    recurseOneOf(propertyType.oneOf);

  return {
    constrainsValuesOnDataTypes: [...constrainsValuesOnDataTypes],
    constrainsPropertiesOnPropertyTypes: [
      ...constrainsPropertiesOnPropertyTypes,
    ],
  };
};
