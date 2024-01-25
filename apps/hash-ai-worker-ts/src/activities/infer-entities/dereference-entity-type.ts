import {
  Array,
  DataType,
  EntityType,
  extractBaseUrl,
  extractVersion,
  Object as BpObject,
  OneOf,
  PropertyType,
  PropertyValues,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import {
  BaseUrl,
  EntityTypeMetadata,
  linkEntityTypeUrl,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getDataTypeById,
  getEntityTypeAndParentsById,
  getPropertyTypeById,
} from "@local/hash-subgraph/stdlib";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";

type MinimalDataType = Pick<DataType, "type">;

type MinimalPropertyObject = BpObject<ValueOrArray<DereferencedPropertyType>>;

type MinimalPropertyTypeValue =
  | MinimalDataType
  | MinimalPropertyObject
  | Array<OneOf<MinimalPropertyTypeValue>>;

export type DereferencedPropertyType = Pick<
  PropertyType,
  "$id" | "description" | "title"
> &
  OneOf<MinimalPropertyTypeValue>;

export type DereferencedEntityType = Pick<
  EntityType,
  "$id" | "description" | "links" | "title"
> & {
  properties: Record<
    BaseUrl,
    DereferencedPropertyType | Array<DereferencedPropertyType>
  >;
} & Pick<EntityTypeMetadata, "labelProperty">;

function dereferencePropertyTypeValue(
  valueReference: PropertyValues,
  subgraph: Subgraph,
): MinimalPropertyTypeValue {
  const isArray = "items" in valueReference;

  if (isArray) {
    return {
      items: {
        oneOf: valueReference.items.oneOf.map((arrayValueReference) =>
          dereferencePropertyTypeValue(arrayValueReference, subgraph),
        ) as [MinimalPropertyTypeValue, ...MinimalPropertyTypeValue[]],
      },
      maxItems: valueReference.maxItems,
      minItems: valueReference.minItems,
      type: "array",
    };
  }

  const isObject = "properties" in valueReference;
  if (isObject) {
    return {
      properties: Object.values(valueReference.properties).reduce<
        MinimalPropertyObject["properties"]
      >((accumulator, propertyRefSchema) => {
        const isInnerArray = "items" in propertyRefSchema;
        const propertyTypeId = isInnerArray
          ? propertyRefSchema.items.$ref
          : propertyRefSchema.$ref;

        const propertyType = getPropertyTypeById(subgraph, propertyTypeId);

        if (!propertyType) {
          throw new Error(`Could not find property with id ${propertyTypeId}`);
        }

        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the function will be hoisted
        const dereferencedPropertyType = dereferencePropertyType(
          propertyType.schema.$id,
          subgraph,
        );

        accumulator[extractBaseUrl(propertyType.schema.$id)] = isInnerArray
          ? {
              type: "array",
              items: dereferencedPropertyType,
              minItems: propertyRefSchema.minItems,
              maxItems: propertyRefSchema.maxItems,
            }
          : dereferencedPropertyType;

        return accumulator;
      }, {}),
      required: valueReference.required,
      type: "object",
    };
  }

  const dataType = getDataTypeById(subgraph, valueReference.$ref);
  if (!dataType) {
    throw new Error(
      `Could not find data type with id ${valueReference.$ref} in subgraph`,
    );
  }

  return {
    type: dataType.schema.type,
  };
}

function dereferencePropertyType(
  propertyTypeId: VersionedUrl,
  subgraph: Subgraph,
): DereferencedPropertyType {
  const propertyType = getPropertyTypeById(subgraph, propertyTypeId);

  if (!propertyType) {
    throw new Error(`Could not find property with id ${propertyTypeId}`);
  }

  const permittedValues = propertyType.schema.oneOf.map((reference) =>
    dereferencePropertyTypeValue(reference, subgraph),
  ) as [MinimalPropertyTypeValue, ...MinimalPropertyTypeValue[]];

  return {
    $id: propertyType.schema.$id,
    title: propertyType.schema.title,
    description: propertyType.schema.description,
    oneOf: permittedValues,
  };
}

/**
 * For a given entityTypeId and a subgraph containing all its dependencies, return a single JSON schema with the following resolved:
 * 1. its parent types
 * 2. its property types
 * 3. property types and data types which its property types refer to

 * Does not dereference 'links', because 'links' is not an expected part of the data object the dereferenced schema describes.
 *
 * See the associated .test.ts file for example input/output
 */
export const dereferenceEntityType = (
  entityTypeId: VersionedUrl,
  subgraph: Subgraph,
): { isLink: boolean; schema: DereferencedEntityType } => {
  const entityTypeWithAncestors = getEntityTypeAndParentsById(
    subgraph,
    entityTypeId,
  );

  const isLink = entityTypeWithAncestors.some(
    (entityType) => entityType.schema.$id === linkEntityTypeUrl,
  );

  let labelProperty: BaseUrl | undefined;
  const mergedProperties: DereferencedEntityType["properties"] = {};

  for (const entityType of entityTypeWithAncestors) {
    /**
     * Take the label property from the first entity type in the inheritance chain which has one.
     * The first item in the array is th entity type itself.
     */
    if (!labelProperty && entityType.metadata.labelProperty) {
      labelProperty = entityType.metadata.labelProperty;
    }

    for (const propertyRefSchema of Object.values(
      entityType.schema.properties,
    )) {
      const isArray = "items" in propertyRefSchema;
      const propertyTypeId = isArray
        ? propertyRefSchema.items.$ref
        : propertyRefSchema.$ref;

      const { baseUrl, version } = componentsFromVersionedUrl(propertyTypeId);

      const existingProperty = mergedProperties[baseUrl];

      /**
       * We prevent properties in an entity type's inheritance chain being added to an entity type via the UI,
       * so this shouldn't happen, but it's technically possibly via updating the type in the API directly.
       * This fallback means that we take the latest version of any property duplicated among the type and its ancestors.
       */
      if (
        !existingProperty ||
        extractVersion(
          "items" in existingProperty
            ? existingProperty.items.$id
            : existingProperty.$id,
        ) < version
      ) {
        const propertySchema = dereferencePropertyType(
          propertyTypeId,
          subgraph,
        );

        mergedProperties[baseUrl] = isArray
          ? { ...propertyRefSchema, items: propertySchema }
          : propertySchema;
      }
    }
  }

  const mergedLinks: DereferencedEntityType["links"] = {};
  for (const entityType of entityTypeWithAncestors) {
    for (const [versionedUrl, linkSchema] of typedEntries(
      entityType.schema.links ?? {},
    )) {
      mergedLinks[versionedUrl] = linkSchema;
    }
  }

  const entityType = entityTypeWithAncestors[0]!;
  if (entityType.schema.$id !== entityTypeId) {
    throw new Error(
      `Expected the entity type with id ${entityTypeId} in the first position in the entityTypeWithAncestors array, got ${entityType.schema.$id}.`,
    );
  }

  const mergedSchema: DereferencedEntityType = {
    $id: entityType.schema.$id,
    title: entityType.schema.title,
    description: entityType.schema.description,
    labelProperty,
    links: mergedLinks,
    properties: mergedProperties,
  };

  return {
    isLink,
    schema: mergedSchema,
  };
};
