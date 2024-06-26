import graphApiJsonSchema from "@apps/hash-graph/openapi/openapi.json";
import type {
  DataType,
  EntityType,
  PropertyType,
} from "@blockprotocol/type-system/slim";
import { JSONSchema as SchemaWithOptional$id } from "json-schema-to-typescript";
type JSONSchema = SchemaWithOptional$id & { $id: string };

export const propertyProvenanceSchema: JSONSchema = {
  ...graphApiJsonSchema.components.schemas.PropertyProvenance,
  $id: "https://hash.ai/schemas/property-provenance",
  title: "PropertyProvenance",
  components: graphApiJsonSchema.components,
  type: "object",
};

export const objectMetadataSchema: JSONSchema = {
  ...graphApiJsonSchema.components.schemas.ObjectMetadata,
  $id: "https://hash.ai/schemas/object-metadata",
  title: "ObjectMetadata",
  type: "object",
  components: graphApiJsonSchema.components,
};

export const arrayMetadataSchema: JSONSchema = {
  ...graphApiJsonSchema.components.schemas.ArrayMetadata,
  $id: "https://hash.ai/schemas/array-metadata",
  title: "ArrayMetadata",
  type: "object",
  components: graphApiJsonSchema.components,
};

const generateMetadataSchemaTitles = ({
  title,
}: Pick<PropertyType | DataType, "title">) => ({
  withMetadataTitle: `${title}WithMetadata`,
  metadataTitle: `${title}Metadata`,
});

const generateMetadataSchemaIdentifiers = ({
  $id,
}: Pick<PropertyType | DataType, "$id">) => ({
  withMetadata$id: $id.replace(
    /(\/types\/(?:property-type|data-type)\/)/,
    /**
     * Insert the path segment /with-metadata/ into the VersionedUrl
     * @example "https://app.hash.ai/@hash/types/property-type/user/v/1" =>
     *   "https://app.hash.ai/@hash/types/property-type/with-metadata/user/v/1"
     */
    "$1with-metadata/",
  ),
  metadata$id: $id.replace(
    /(\/types\/(?:entity-type|property-type|data-type)\/)/,
    "$1-metadata/",
  ),
});

export const generateDataTypeWithMetadataSchema = (
  dataTypeSchema: DataType,
): JSONSchema => {
  const { withMetadata$id, metadata$id } = generateMetadataSchemaIdentifiers({
    $id: dataTypeSchema.$id,
  });

  const { withMetadataTitle, metadataTitle } = generateMetadataSchemaTitles({
    title: dataTypeSchema.title,
  });

  return {
    $id: withMetadata$id,
    title: withMetadataTitle,
    type: "object",
    value: { $ref: dataTypeSchema.$id },
    metadata: {
      ...graphApiJsonSchema.components.schemas.ValueMetadata,
      $id: metadata$id,
      title: metadataTitle,
      dataTypeId: { const: dataTypeSchema.$id },
    },
    required: ["metadata", "value"],
    components: graphApiJsonSchema.components,
  };
};

export const generatePropertyTypeWithMetadataSchema = (
  propertyTypeSchema: PropertyType,
): JSONSchema => {
  const { withMetadata$id, metadata$id } = generateMetadataSchemaIdentifiers({
    $id: propertyTypeSchema.$id,
  });

  const { withMetadataTitle, metadataTitle } = generateMetadataSchemaTitles({
    title: propertyTypeSchema.title,
  });

  return {
    $id: withMetadata$id,
    title: withMetadataTitle,
    type: "object",
    value: { $ref: propertyTypeSchema.$id },
    metadata: {
      $id: metadata$id,
      title: metadataTitle,
    },
    required: ["value"],
    components: graphApiJsonSchema.components,
  };
};

export const generateMetadataSchemaForPropertiesObject = (
  properties: EntityType["properties"],
  required: string[],
): JSONSchema => {
  return {
    type: "object",
    properties: {
      metadata: { $ref: objectMetadataSchema.$id },
      value: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(properties).map(([baseUrl, refSchema]) => {
            const propertyWithMetadataRef = generateMetadataSchemaIdentifiers({
              $id: "items" in refSchema ? refSchema.items.$ref : refSchema.$ref,
            }).withMetadata$id;

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
                    metadata: {
                      $ref: arrayMetadataSchema.$id,
                    },
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
};
