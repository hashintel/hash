import { EntityType } from "@blockprotocol/graph";

import { EntityTypeEditorFormData } from "./shared/form-types";

type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

export const getFormDataFromSchema = (
  schema: EntityType,
): EntityTypeEditorFormData => ({
  properties: Object.entries(schema.properties).map(([propertyId, ref]) => {
    const isArray = "type" in ref;

    return {
      $id: isArray ? ref.items.$ref : ref.$ref,
      required: !!schema.required?.includes(propertyId),
      array: isArray,
      maxValue: isArray ? ref.maxItems ?? 1 : 1,
      minValue: isArray ? ref.minItems ?? 0 : 0,
      infinity: isArray && typeof ref.maxItems !== "number",
    };
  }),
  links: schema.links
    ? (Object.entries(schema.links) as Entries<typeof schema.links>).map(
        ([linkEntityTypeId, link]) => ({
          $id: linkEntityTypeId,
          array: true,
          maxValue: link.maxItems ?? 1,
          minValue: link.minItems ?? 0,
          infinity: typeof link.maxItems !== "number",
          entityTypes:
            "oneOf" in link.items
              ? link.items.oneOf.map((ref) => ref.$ref)
              : [],
        }),
      )
    : [],
});
