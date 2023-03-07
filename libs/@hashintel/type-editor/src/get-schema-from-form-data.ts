import {
  EntityType,
  EntityTypeReference,
  extractBaseUrl,
  PropertyTypeReference,
  ValueOrArray,
} from "@blockprotocol/type-system/slim";

import { EntityTypeEditorFormData } from "./shared/form-types";

export const getSchemaFromFormData = (
  data: EntityTypeEditorFormData,
): Required<Pick<EntityType, "links" | "properties" | "required">> => {
  const properties = data.properties;

  const schemaProperties: Record<
    string,
    ValueOrArray<PropertyTypeReference>
  > = {};
  const required = [];

  for (const property of properties) {
    const propertyKey = extractBaseUrl(property.$id);

    if (
      typeof property.minValue === "string" ||
      typeof property.maxValue === "string"
    ) {
      throw new Error("Invalid property constraint");
    }

    const prop: ValueOrArray<PropertyTypeReference> = property.array
      ? {
          type: "array",
          minItems: property.minValue,
          items: { $ref: property.$id },
          ...(property.infinity ? {} : { maxItems: property.maxValue }),
        }
      : { $ref: property.$id };

    schemaProperties[propertyKey] = prop;

    if (property.required) {
      required.push(extractBaseUrl(property.$id));
    }
  }

  const links: NonNullable<EntityType["links"]> = {};

  for (const link of data.links) {
    if (
      typeof link.minValue === "string" ||
      typeof link.maxValue === "string"
    ) {
      throw new Error("Invalid property constraint");
    }

    links[link.$id] = {
      type: "array",
      minItems: link.minValue,
      ...(link.infinity ? {} : { maxItems: link.maxValue }),
      ordered: false,
      items: link.entityTypes.length
        ? {
            oneOf: link.entityTypes.map((id) => ({ $ref: id })) as [
              EntityTypeReference,
              ...EntityTypeReference[],
            ], // assert that there is at least one item in the array
          }
        : {},
    };
  }

  return {
    properties: schemaProperties,
    links,
    required,
  };
};
