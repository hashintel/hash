import type { PropertyValueArray } from "@blockprotocol/type-system";
import type { JSONSchemaDefinition } from "openai/lib/jsonschema";

import type { DereferencedPropertyType } from "../../shared/dereference-entity-type.js";

/**
 * Strip the `$id` field from the dereferenced property type definitions,
 * as it confuses Anthropic's model (it opts for using the $id as the
 * property key, instead of the property key we specify in the schema
 * leading to repeated schema validation errors).
 */
export const stripIdsFromDereferencedProperties = (params: {
  properties: Record<
    string,
    DereferencedPropertyType | PropertyValueArray<DereferencedPropertyType>
  >;
}): {
  [key: string]: JSONSchemaDefinition;
} => {
  const { properties } = params;

  // @ts-expect-error - we need to update exclusiveMinimum and exclusiveMaximum to be numbers rather than booleans
  return Object.entries(properties).reduce<{
    [key: string]: JSONSchemaDefinition;
    // @ts-expect-error - we need to update exclusiveMinimum and exclusiveMaximum to be numbers rather than booleans
  }>((acc, [propertyKey, value]) => {
    if ("items" in value) {
      const { $id: _id, ...itemsWithoutId } = value.items;

      return {
        ...acc,
        [propertyKey]: {
          ...value,
          items: {
            ...itemsWithoutId,
            oneOf: itemsWithoutId.oneOf.map((oneOfValue) => {
              if (
                typeof oneOfValue === "object" &&
                "properties" in oneOfValue
              ) {
                return {
                  ...oneOfValue,
                  properties: stripIdsFromDereferencedProperties({
                    properties: oneOfValue.properties,
                  }),
                };
              }

              return oneOfValue;
            }),
          },
        },
      };
    }

    const { $id: _id, ...valueWithoutId } = value;

    acc[propertyKey] = {
      ...valueWithoutId,
      // @ts-expect-error - we need to update exclusiveMinimum and exclusiveMaximum to be numbers rather than booleans
      oneOf: valueWithoutId.oneOf.map((oneOfValue) => {
        if (typeof oneOfValue === "object" && "properties" in oneOfValue) {
          return {
            ...oneOfValue,
            properties: stripIdsFromDereferencedProperties({
              properties: oneOfValue.properties,
            }),
          };
        }

        return oneOfValue;
      }),
    };

    return acc;
  }, {});
};
