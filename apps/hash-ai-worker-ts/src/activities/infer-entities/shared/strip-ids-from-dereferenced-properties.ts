import type { JSONSchemaDefinition } from "openai/lib/jsonschema";
import type { ArraySchema } from "@blockprotocol/type-system";

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
    DereferencedPropertyType | ArraySchema<DereferencedPropertyType>
  >;
}): {
  [key: string]: JSONSchemaDefinition;
} => {
  const { properties } = params;

  return Object.entries(properties).reduce<{
    [key: string]: JSONSchemaDefinition;
  }>((accumulator, [propertyKey, value]) => {
    if ("items" in value) {
      const { $id: _id, ...itemsWithoutId } = value.items;

      return {
        ...accumulator,
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

    accumulator[propertyKey] = {
      ...valueWithoutId,
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

    return accumulator;
  }, {});
};
