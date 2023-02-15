import {
  EntityType,
  extractBaseUri,
  PropertyTypeReference,
  ValueOrArray,
} from "@blockprotocol/type-system";

import { EntityTypeEditorFormData } from "./shared/form-types";

export const getSchemaFromFormData = (
  data: EntityTypeEditorFormData,
): Partial<EntityType> => {
  const properties = data.properties;

  const schemaProperties: Record<
    string,
    ValueOrArray<PropertyTypeReference>
  > = {};
  const required = [];

  for (const property of properties) {
    const propertyKey = extractBaseUri(property.$id);

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
      required.push(extractBaseUri(property.$id));
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
        ? ({ oneOf: link.entityTypes.map((id) => ({ $ref: id })) } as any) // @todo fix this
        : {},
    };
  }

  return {
    properties: schemaProperties,
    links,
    required,
  };
};
