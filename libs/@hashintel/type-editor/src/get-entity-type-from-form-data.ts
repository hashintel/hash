import type {
  EntityType,
  EntityTypeReference,
  PropertyTypeReference,
  ValueOrArray,
} from "@blockprotocol/type-system";
import { atLeastOne, extractBaseUrl } from "@blockprotocol/type-system";

import type { EntityTypeEditorFormData } from "./shared/form-types";

export const getEntityTypeFromFormData = (
  data: EntityTypeEditorFormData,
): {
  schema: Required<Pick<EntityType, "description" | "links" | "properties">> &
    Pick<
      EntityType,
      | "allOf"
      | "required"
      | "labelProperty"
      | "icon"
      | "titlePlural"
      | "inverse"
    >;
} => {
  const allOf = atLeastOne<EntityTypeReference>(
    data.allOf.map((versionedUrl) => ({ $ref: versionedUrl })),
  );

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

    const oneOf = atLeastOne(link.entityTypes.map((id) => ({ $ref: id })));
    links[link.$id] = {
      type: "array",
      minItems: link.minValue,
      ...(link.infinity ? {} : { maxItems: link.maxValue }),
      items: oneOf ? { oneOf } : {},
    };
  }

  return {
    schema: {
      allOf,
      description: data.description,
      properties: schemaProperties,
      links,
      required: atLeastOne(required),
      icon: data.icon,
      labelProperty: data.labelProperty,
      titlePlural: data.titlePlural,
      inverse: data.inverse,
    },
  };
};
