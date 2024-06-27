import type {
  DataType,
  EntityType,
  PropertyType,
  PropertyValues,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { isPropertyValuesArray } from "@blockprotocol/type-system/slim";
import type { JSONSchema as PartialJsonSchema } from "json-schema-to-typescript";

import {
  generatedTypeSuffix,
  JsonSchema,
  redundantTypePlaceholder,
} from "../../shared";

const kind = "metadataSchema";

/**
 * We already have types for these schemas generated from the Graph API,
 * so we just want this codegen to insert the title of the type rather than generate it again,
 * – we'll add import statements for the types in post-processing.
 */
const confidenceSchema: JsonSchema = {
  $id: "https://hash.ai/@hash/schemas/array-metadata/v/1",
  title: "Confidence",
  kind,
  const: redundantTypePlaceholder,
};

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
    /(\/types\/(?:property-type|data-type)\/)/,
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
          confidence: confidenceSchema,
          dataTypeId: { const: dataTypeSchema.$id },
        },
        required: ["dataTypeId"],
      },
    },
    required: ["metadata", "value"],
  };
};

type AddressableEntityProperties = {
  title: string;
  $id: VersionedUrl;
} | null;

type ObjectWithMetadataParams = {
  properties: EntityType["properties"];
  required: string[];
  identifiersForAddressableEntityProperties: AddressableEntityProperties;
};

export function generatePropertiesObjectWithMetadataSchema(
  params: ObjectWithMetadataParams & {
    identifiersForAddressableEntityProperties: null;
  },
): PartialJsonSchema;
export function generatePropertiesObjectWithMetadataSchema(
  params: ObjectWithMetadataParams & {
    identifiersForAddressableEntityProperties: {
      title: string;
      $id: VersionedUrl;
    };
  },
): JsonSchema;
export function generatePropertiesObjectWithMetadataSchema({
  properties,
  required,
  identifiersForAddressableEntityProperties,
}: ObjectWithMetadataParams): PartialJsonSchema | JsonSchema {
  const title = identifiersForAddressableEntityProperties
    ? generateMetadataSchemaTitles({
        title: identifiersForAddressableEntityProperties.title,
      }).valueWithMetadataTitle
    : undefined;

  const $id = identifiersForAddressableEntityProperties
    ? generateMetadataSchemaIdentifiers({
        $id: identifiersForAddressableEntityProperties.$id,
      }).valueWithMetadata$id
    : undefined;

  return {
    type: "object",
    title,
    $id,
    kind,
    properties: {
      metadata: objectMetadataSchema,
      value: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(properties).map(([baseUrl, refSchema]) => {
            const propertyWithMetadataRef = generateMetadataSchemaIdentifiers({
              $id: "items" in refSchema ? refSchema.items.$ref : refSchema.$ref,
            }).valueWithMetadata$id;

            if ("items" in refSchema) {
              return [
                baseUrl,
                {
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
                },
              ];
            }

            return [
              baseUrl,
              {
                $ref: propertyWithMetadataRef,
              },
            ];
          }),
        ),
        required,
      },
    },
  };
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
      type: "array",
      items: {
        oneOf: propertyValue.items.oneOf.map(
          generatePropertyValueWithMetadataTree,
        ),
      },
    };
  }

  const { properties, required } = propertyValue;

  return generatePropertiesObjectWithMetadataSchema({
    properties,
    required: required ?? [],
    identifiersForAddressableEntityProperties: null,
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
    oneOf: propertyTypeSchema.oneOf.map(generatePropertyValueWithMetadataTree),
    required: ["value"],
  };
};
