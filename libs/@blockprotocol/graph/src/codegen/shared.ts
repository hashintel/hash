import type { JSONSchema as SchemaWithOptional$id } from "json-schema-to-typescript";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";

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
  metadataSchema: "",
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

export type JsonSchema = SchemaWithOptional$id & {
  $id: VersionedUrl;
  title: string;
  kind: "metadataSchema";
};

export const identifiersForExternalImports = [
  "LinkEntity",
  "Entity",
  "ArrayMetadata",
  "Confidence",
  "ObjectMetadata",
  "PropertyProvenance",
] as const;

export type IdentifierForExternalImport =
  (typeof identifiersForExternalImports)[number];

export const metadataSchemaKind = "metadataSchema";

/**
 * We already have types for these schemas generated from the Graph API,
 * so we just want this codegen to insert the title of the type rather than generate it again,
 * – we'll add import statements for the types in post-processing.
 */
export const propertyProvenanceSchema: JsonSchema = {
  $id: "https://hash.ai/@hash/schemas/property-provenance/v/1",
  title: "PropertyProvenance",
  kind: metadataSchemaKind,
  const: redundantTypePlaceholder,
};

export const objectMetadataSchema: JsonSchema = {
  $id: "https://hash.ai/@hash/schemas/object-metadata/v/1",
  title: "ObjectMetadata",
  kind: metadataSchemaKind,
  const: redundantTypePlaceholder,
};

export const arrayMetadataSchema: JsonSchema = {
  $id: "https://hash.ai/@hash/schemas/array-metadata/v/1",
  title: "ArrayMetadata",
  kind: metadataSchemaKind,
  const: redundantTypePlaceholder,
};

export const confidenceMetadataSchema: JsonSchema = {
  $id: "https://hash.ai/@hash/schemas/confidence/v/1",
  title: "Confidence",
  kind: metadataSchemaKind,
  const: redundantTypePlaceholder,
};

export const sharedMetadataSchemas = [
  propertyProvenanceSchema,
  objectMetadataSchema,
  confidenceMetadataSchema,
  arrayMetadataSchema,
];
