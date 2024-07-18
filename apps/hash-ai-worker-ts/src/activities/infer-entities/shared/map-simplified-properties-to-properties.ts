import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  PropertyObject,
  PropertyValue,
} from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";

export type PropertyValueWithSimplifiedProperties =
  | PropertyValue
  | PropertiesObjectWithSimplifiedProperties;

export type PropertiesObjectWithSimplifiedProperties = {
  [_: string]: PropertyValueWithSimplifiedProperties;
};

const mapSimplifiedPropertyValueToPropertyValue = (params: {
  simplifiedPropertyValue: PropertyValueWithSimplifiedProperties;
  simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
}): Entity["properties"][BaseUrl] => {
  const { simplifiedPropertyValue, simplifiedPropertyTypeMappings } = params;

  if (
    typeof simplifiedPropertyValue !== "object" ||
    simplifiedPropertyValue === null
  ) {
    return simplifiedPropertyValue;
  }

  if (Array.isArray(simplifiedPropertyValue)) {
    return simplifiedPropertyValue.map((value) =>
      mapSimplifiedPropertyValueToPropertyValue({
        simplifiedPropertyValue: value,
        simplifiedPropertyTypeMappings,
      }),
    );
  }

  return Object.entries(simplifiedPropertyValue).reduce<PropertyObject>(
    (acc, [maybeSimplifiedId, value]) => {
      const baseUrl = simplifiedPropertyTypeMappings[maybeSimplifiedId];

      if (!baseUrl) {
        /**
         * We can't throw here, because this might be a JSON Object which
         * doesn't define properties via property types. Therefore there
         * may not be a corresponding mapping to a base URL.
         *
         * @todo: figure out how we can know which is which (potentially
         * by requiring the property types in this method)
         */
        return {
          ...acc,
          [maybeSimplifiedId]: value,
        };
      }

      return {
        ...acc,
        [baseUrl]: mapSimplifiedPropertyValueToPropertyValue({
          simplifiedPropertyValue: value,
          simplifiedPropertyTypeMappings,
        }),
      };
    },
    {} as Entity["properties"],
  );
};

export const mapSimplifiedPropertiesToProperties = (params: {
  simplifiedProperties: Record<string, PropertyValueWithSimplifiedProperties>;
  simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
}): Entity["properties"] => {
  const { simplifiedProperties, simplifiedPropertyTypeMappings } = params;

  return Object.entries(simplifiedProperties).reduce<Entity["properties"]>(
    (acc, [simplifiedId, value]) => {
      const baseUrl = simplifiedPropertyTypeMappings[simplifiedId];

      if (!baseUrl) {
        throw new Error(
          `Could not find base URL mapping for simplified property ID: ${simplifiedId}`,
        );
      }

      return {
        ...acc,
        [baseUrl]: mapSimplifiedPropertyValueToPropertyValue({
          simplifiedPropertyValue: value,
          simplifiedPropertyTypeMappings,
        }),
      };
    },
    {} as Entity["properties"],
  );
};
