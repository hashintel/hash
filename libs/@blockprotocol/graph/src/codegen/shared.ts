export type LogLevel = "silent" | "warn" | "info" | "debug" | "trace";

/** The name of the file that contains types shared between generated files. */
export const sharedTypeFileName = "shared.ts";

export const primitiveLinkEntityTypeId =
  "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1";

/** The suffix to append to generated types for each class of ontology type */
export const generatedTypeSuffix = {
  dataType: "DataType",
  propertyType: "PropertyValue",
  entityType: "Properties",
};

const trimEntityTypeSuffixRegex = new RegExp(
  `${generatedTypeSuffix.entityType}$`,
  "m",
);

export const entityDefinitionNameForEntityType = (typeName: string) =>
  typeName.replace(trimEntityTypeSuffixRegex, "");

/** A placeholder type used in the workaround in the "$ref" resolver of the JSON Schema compiler */
export const redundantTypePlaceholder = "PLACEHOLDER";

export type CompiledTsType = string;
