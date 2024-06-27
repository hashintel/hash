import type {
  DataType,
  EntityType,
  PropertyType,
  PropertyValues,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { isPropertyValuesArray } from "@blockprotocol/type-system/slim";
import type { JSONSchema as PartialJsonSchema } from "json-schema-to-typescript";

import type { JsonSchema } from "../../shared";
import { generatedTypeSuffix, redundantTypePlaceholder } from "../../shared";
import { InitializeContext } from "../../context/initialize";

const kind = "metadataSchema";

/**
 * We already have types for these schemas generated from the Graph API,
 * so we just want this codegen to insert the title of the type rather than generate it again,
 * – we'll add import statements for the types in post-processing.
 */
const propertyProvenanceSchema: JsonSchema = {
  $id: "https://hash.ai/@hash/schemas/property-provenance/v/1",
  title: "PropertyProvenance",
  kind,
  const: redundantTypePlaceholder,
};

const objectMetadataSchema: JsonSchema = {
  $id: "https://hash.ai/@hash/schemas/object-metadata/v/1",
  title: "ObjectMetadata",
  kind,
  const: redundantTypePlaceholder,
};

const arrayMetadataSchema: JsonSchema = {
  $id: "https://hash.ai/@hash/schemas/array-metadata/v/1",
  title: "ArrayMetadata",
  kind,
  const: redundantTypePlaceholder,
};

const generateMetadataSchemaTitles = ({
  title,
}: Pick<PropertyType | DataType, "title">) => ({
  valueWithMetadataTitle: `${title} With Metadata`,
  metadataTitle: `${title} Metadata`,
});

const generateMetadataSchemaIdentifiers = ({
  $id,
}: Pick<PropertyType | DataType, "$id">) => ({
  valueWithMetadata$id: $id.replace(
    /(\/types\/(?:entity-type|property-type|data-type)\/)/,
    /**
     * Insert the path segment /with-metadata/ into the VersionedUrl
     * @example "https://app.hash.ai/@hash/types/property-type/user/v/1" =>
     *   "https://app.hash.ai/@hash/types/property-type/with-metadata/user/v/1"
     */
    "$1with-metadata/",
  ) as VersionedUrl,
  metadata$id: $id.replace(
    /(\/types\/(?:entity-type|property-type|data-type)\/)/,
    "$1metadata/",
  ) as VersionedUrl,
});

/**
 * Generate a schema for a data type with metadata, which is an object with two properties:
 * { value: SomeLeafValue, metadata: { provenance?: PropertyProvenance, confidence?: number, dataTypeId: VersionedUrl } }
 */
export const generateDataTypeWithMetadataSchema = (
  dataTypeSchema: DataType,
  context: InitializeContext,
): JsonSchema => {
  const { valueWithMetadata$id, metadata$id } =
    generateMetadataSchemaIdentifiers({
      $id: dataTypeSchema.$id,
    });

  const { valueWithMetadataTitle, metadataTitle } =
    generateMetadataSchemaTitles({
      title: `${dataTypeSchema.title} ${generatedTypeSuffix.dataType}`,
    });

  context.typeDependencyMap.addDependencyForType(
    metadata$id,
    propertyProvenanceSchema.$id,
  );

  return {
    $id: valueWithMetadata$id,
    title: valueWithMetadataTitle,
    kind,
    type: "object",
    properties: {
      value: { $ref: dataTypeSchema.$id },
      metadata: {
        $id: metadata$id,
        title: metadataTitle,
        type: "object",
        properties: {
          provenance: propertyProvenanceSchema,
          confidence: {
            $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
          },
          dataTypeId: { const: dataTypeSchema.$id },
        },
        required: ["dataTypeId"],
      },
    },
    required: ["metadata", "value"],
  };
};

type ParentType = {
  title: string;
  $id: VersionedUrl;
};

type ObjectWithMetadataParams = {
  properties: EntityType["properties"];
  required: string[];
  identifiersForParentType: ParentType;
};

export function generatePropertiesObjectWithMetadataSchema(
  { properties, required, identifiersForParentType }: ObjectWithMetadataParams,
  context: InitializeContext,
  createAddressableType: false,
): PartialJsonSchema;
export function generatePropertiesObjectWithMetadataSchema(
  { properties, required, identifiersForParentType }: ObjectWithMetadataParams,
  context: InitializeContext,
  createAddressableType: true,
): JsonSchema;
/**
 * Generate a schema for a properties object with metadata.
 *
 * The parent identifiers are used to ensure that any metadata type dependencies are included in the file alongside the generated type.
 *
 * If createAddressAbleType is true, it will also assign an $id to the type so that it appears separately.
 * The $id is derived from the parent and assumes that the parent is creating only a single properties object
 * – do not use this for properties objects defined within a property type, which may include multiple properties objects.
 */
export function generatePropertiesObjectWithMetadataSchema(
  { properties, required, identifiersForParentType }: ObjectWithMetadataParams,
  context: InitializeContext,
  createAddressableType: boolean,
): JsonSchema | PartialJsonSchema {
  const title = generateMetadataSchemaTitles({
    title: `${identifiersForParentType.title} Properties`,
  }).valueWithMetadataTitle;

  const $id = generateMetadataSchemaIdentifiers({
    $id: identifiersForParentType.$id,
  }).valueWithMetadata$id.replace(
    "/with-metadata/",
    "/properties-with-metadata/",
  ) as VersionedUrl;

  context.typeDependencyMap.addDependencyForType(
    createAddressableType ? $id : identifiersForParentType.$id,
    objectMetadataSchema.$id,
  );

  const propertiesSchema = Object.entries(properties).reduce<PartialJsonSchema>(
    (acc, [baseUrl, refSchema]) => {
      const propertyWithMetadataRef = generateMetadataSchemaIdentifiers({
        $id: "items" in refSchema ? refSchema.items.$ref : refSchema.$ref,
      }).valueWithMetadata$id;

      if ("items" in refSchema) {
        acc[baseUrl] = {
          type: "object",
          properties: {
            value: {
              type: "array",
              items: {
                $ref: propertyWithMetadataRef,
              },
            },
            metadata: arrayMetadataSchema,
          },
          required: ["value"],
        };

        context.typeDependencyMap.addDependencyForType(
          $id,
          arrayMetadataSchema.$id,
        );
      } else {
        acc[baseUrl] = {
          $ref: propertyWithMetadataRef,
        };
      }

      return acc;
    },
    {},
  );

  return {
    type: "object",
    title: createAddressableType ? title : undefined,
    $id: createAddressableType ? $id : undefined,
    kind,
    properties: {
      metadata: objectMetadataSchema,
      value: {
        type: "object",
        properties: propertiesSchema,
        required,
      },
    },
  };
}

const generatePropertyValueWithMetadataTree = (
  propertyValue: PropertyValues,
  context: InitializeContext,
  parent: ParentType,
): PartialJsonSchema => {
  if ("$ref" in propertyValue) {
    /**
     * This is our base case – a reference to a data type { value, metadata } schema,
     * which can contain no further references to other schemas.
     */
    return {
      $ref: generateMetadataSchemaIdentifiers({ $id: propertyValue.$ref })
        .valueWithMetadata$id,
    };
  }

  if (isPropertyValuesArray(propertyValue)) {
    return {
      type: "array",
      items: {
        oneOf: propertyValue.items.oneOf.map((item) =>
          generatePropertyValueWithMetadataTree(item, context, parent),
        ),
      },
    };
  }

  const { properties, required } = propertyValue;

  return generatePropertiesObjectWithMetadataSchema(
    {
      properties,
      required: required ?? [],
      identifiersForParentType: parent,
    },
    context,
    false,
  );
};

export const generatePropertyTypeWithMetadataSchema = (
  propertyTypeSchema: PropertyType,
  context: InitializeContext,
): JsonSchema => {
  const { valueWithMetadata$id } = generateMetadataSchemaIdentifiers({
    $id: propertyTypeSchema.$id,
  });

  const { valueWithMetadataTitle } = generateMetadataSchemaTitles({
    title: `${propertyTypeSchema.title} ${generatedTypeSuffix.propertyType}`,
  });

  return {
    $id: valueWithMetadata$id,
    title: valueWithMetadataTitle,
    kind,
    oneOf: propertyTypeSchema.oneOf.map((entry) =>
      generatePropertyValueWithMetadataTree(entry, context, {
        title: propertyTypeSchema.title,
        $id: propertyTypeSchema.$id,
      }),
    ),
    required: ["value"],
  };
};
