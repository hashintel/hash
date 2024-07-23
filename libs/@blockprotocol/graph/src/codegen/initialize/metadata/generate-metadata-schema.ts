import type {
  DataType,
  EntityType,
  PropertyType,
  PropertyValues,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { isPropertyValuesArray } from "@blockprotocol/type-system/slim";
import type { JSONSchema as PartialJsonSchema } from "json-schema-to-typescript";

import type { JsonSchema } from "../../shared.js";
import {
  arrayMetadataSchema,
  confidenceMetadataSchema,
  generatedTypeSuffix,
  metadataSchemaKind as kind,
  objectMetadataSchema,
  propertyProvenanceSchema,
} from "../../shared.js";

const generateMetadataSchemaTitles = ({
  title,
}: Pick<EntityType | PropertyType | DataType, "title">) => ({
  valueWithMetadataTitle: `${title} With Metadata`,
  valueWithMetadataValueTitle: `${title} With Metadata Value`,
  metadataTitle: `${title} Metadata`,
});

export const generateMetadataSchemaIdentifiers = ({
  $id,
  prependProperties,
}: Pick<EntityType | PropertyType | DataType, "$id"> & {
  prependProperties?: boolean;
}) => ({
  valueWithMetadata$id: $id.replace(
    /(\/types\/(?:entity-type|property-type|data-type)\/)/,
    /**
     * Insert the path segment /with-metadata/ into the VersionedUrl
     * @example "https://app.hash.ai/@hash/types/property-type/user/v/1" =>
     *   "https://app.hash.ai/@hash/types/property-type/with-metadata/user/v/1"
     */
    `$1${prependProperties ? "properties-" : ""}with-metadata/`,
  ) as VersionedUrl,
  valueWithMetadataValue$id: $id.replace(
    /(\/types\/(?:entity-type|property-type|data-type)\/)/,
    /**
     * Insert the path segment /with-metadata/ into the VersionedUrl
     * @example "https://app.hash.ai/@hash/types/property-type/user/v/1" =>
     *   "https://app.hash.ai/@hash/types/property-type/with-metadata/user/v/1"
     */
    `$1${prependProperties ? "properties-" : ""}with-metadata-value/`,
  ) as VersionedUrl,
  metadata$id: $id.replace(
    /(\/types\/(?:entity-type|property-type|data-type)\/)/,
    "$1metadata/",
  ) as VersionedUrl,
});

/**
 * Generate a schema for a data type with metadata, which is an object with two properties:
 * { value: SomeLeafValue, metadata: { provenance?: PropertyProvenance, confidence?: number, dataTypeId: VersionedUrl }
 *
 * Also generates a separate schema for the metadata object.
 */
export const generateDataTypeWithMetadataSchema = (
  dataTypeSchema: DataType,
): JsonSchema => {
  const { valueWithMetadata$id, metadata$id } =
    generateMetadataSchemaIdentifiers({
      $id: dataTypeSchema.$id,
    });

  const { valueWithMetadataTitle, metadataTitle } =
    generateMetadataSchemaTitles({
      title: `${dataTypeSchema.title} ${generatedTypeSuffix.dataType}`,
    });

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
          confidence: confidenceMetadataSchema,
          dataTypeId: { const: dataTypeSchema.$id },
        },
        required: ["dataTypeId"],
      },
    },
    required: ["metadata", "value"],
  };
};

type EntityOwnerIdentifiers = {
  title: string;
  $id: VersionedUrl;
};

type ObjectWithMetadataParams = {
  allOfForValueWithMetadataValue?: EntityType["allOf"];
  properties: EntityType["properties"];
  required: string[];
  entityOwnerIdentifiers: EntityOwnerIdentifiers | null;
};

export function generatePropertiesObjectWithMetadataSchema({
  allOfForValueWithMetadataValue,
  properties,
  required,
  entityOwnerIdentifiers,
}: ObjectWithMetadataParams & {
  entityOwnerIdentifiers: null;
}): PartialJsonSchema;
export function generatePropertiesObjectWithMetadataSchema({
  allOfForValueWithMetadataValue,
  properties,
  required,
  entityOwnerIdentifiers,
}: ObjectWithMetadataParams & {
  entityOwnerIdentifiers: EntityOwnerIdentifiers;
}): JsonSchema;
/**
 * Generate a schema for a properties object with metadata.
 *
 * If entityOwnerIdentifiers is provided, it will also assign an $id to the type so that it appears separately.
 * The $id is derived from the owning entity and assumes that the owner is creating only a single properties object
 * – do not use this for properties objects defined within a property type, which may include multiple properties
 * objects.
 */
export function generatePropertiesObjectWithMetadataSchema({
  allOfForValueWithMetadataValue,
  properties,
  required,
  entityOwnerIdentifiers,
}: ObjectWithMetadataParams): JsonSchema | PartialJsonSchema {
  const { valueWithMetadataTitle, valueWithMetadataValueTitle } =
    entityOwnerIdentifiers
      ? generateMetadataSchemaTitles({
          title: `${entityOwnerIdentifiers.title} Properties`,
        })
      : ({} as Record<string, undefined>);

  const { valueWithMetadata$id, valueWithMetadataValue$id } =
    entityOwnerIdentifiers
      ? generateMetadataSchemaIdentifiers({
          $id: entityOwnerIdentifiers.$id,
          prependProperties: true,
        })
      : ({} as Record<string, undefined>);

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
      } else {
        acc[baseUrl] = {
          $ref: propertyWithMetadataRef,
        };
      }

      return acc;
    },
    {},
  );

  const schema: JsonSchema | PartialJsonSchema = {
    type: "object",
    $id: valueWithMetadata$id,
    title: valueWithMetadataTitle,
    kind,
    properties: {
      metadata: objectMetadataSchema,
      value: {
        $id: valueWithMetadataValue$id,
        title: valueWithMetadataValueTitle,
        kind,
        type: "object",
        properties: propertiesSchema,
        required,
      },
    },
    required: ["value"],
  };

  if (allOfForValueWithMetadataValue) {
    schema.properties!.value!.allOf = allOfForValueWithMetadataValue;
  }

  return schema;
}

const generatePropertyValueWithMetadataTree = (
  propertyValue: PropertyValues,
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
      type: "object",
      properties: {
        value: {
          type: "array",
          items: {
            oneOf: propertyValue.items.oneOf.map((item) =>
              generatePropertyValueWithMetadataTree(item),
            ),
          },
        },
        metadata: arrayMetadataSchema,
      },
      required: ["value"],
    };
  }

  const { properties, required } = propertyValue;

  return generatePropertiesObjectWithMetadataSchema({
    properties,
    required: required ?? [],
    entityOwnerIdentifiers: null,
  });
};

export const generatePropertyTypeWithMetadataSchema = (
  propertyTypeSchema: PropertyType,
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
      generatePropertyValueWithMetadataTree(entry),
    ),
  };
};
