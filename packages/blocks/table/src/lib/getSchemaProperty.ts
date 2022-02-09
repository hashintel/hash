import { Definition, DefinitionOrBoolean } from "typescript-json-schema";

export const getSchemaPropertyDefinition = (
  // eslint-disable-next-line @typescript-eslint/default-param-last -- @todo consider refactoring function signature
  schema: Definition = {},
  property: string,
): Definition | null | undefined => {
  const keys = property.split(".");

  let definition: DefinitionOrBoolean | undefined = schema;
  for (const key of keys) {
    const properties: Definition["properties"] = definition.properties;
    if (!properties) {
      return null;
    }
    definition = properties[key];
    if (typeof definition === "boolean") {
      return null;
    }
  }
  return definition;
};
