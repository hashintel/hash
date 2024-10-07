import type {
  DataType,
  EntityType,
  OneOfSchema,
  PropertyType,
  PropertyValueArray,
  PropertyValueObject,
  PropertyValues,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { atLeastOne, extractVersion } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  BaseUrl,
  EntityTypeMetadata,
} from "@local/hash-graph-types/ontology";
import type { Subgraph } from "@local/hash-subgraph";
import { linkEntityTypeUrl } from "@local/hash-subgraph";
import {
  getDataTypeById,
  getEntityTypeAndParentsById,
  getPropertyTypeById,
} from "@local/hash-subgraph/stdlib";
import {
  componentsFromVersionedUrl,
  extractBaseUrl,
} from "@local/hash-subgraph/type-system-patch";

import { generateSimplifiedTypeId } from "../infer-entities/shared/generate-simplified-type-id.js";

type MinimalDataType = Omit<DataType, "$id" | "$schema" | "kind" | "allOf">;

type MinimalPropertyObject = PropertyValueObject<
  ValueOrArray<DereferencedPropertyType>
> & { additionalProperties: false };

export type MinimalPropertyTypeValue =
  | MinimalDataType
  | MinimalPropertyObject
  | PropertyValueArray<OneOfSchema<MinimalPropertyTypeValue>>;

export type DereferencedPropertyType = Pick<
  PropertyType,
  "$id" | "description" | "title"
> &
  OneOfSchema<MinimalPropertyTypeValue>;

/**
 * An entity type with all its dependencies dereferenced and their simplified schemas in-lined.
 *
 * If the dereference function is called with `simplifyPropertyKeys` set to `true`, the property keys in the schema
 * will be simplified from BaseUrls to simple strings. The mapping back to BaseUrls is returned from the function
 */
export type DereferencedEntityType<
  PropertyTypeKey extends string | BaseUrl = BaseUrl,
> = Pick<EntityType, "$id" | "description" | "links" | "required" | "title"> & {
  properties: Record<
    PropertyTypeKey,
    DereferencedPropertyType | PropertyValueArray<DereferencedPropertyType>
  >;
  additionalProperties: false;
} & Pick<EntityTypeMetadata, "labelProperty">;

export type DereferencedEntityTypeWithSimplifiedKeys = {
  isLink: boolean;
  schema: DereferencedEntityType<string>;
  simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
};

const dereferencePropertyTypeValue = (params: {
  valueReference: PropertyValues;
  subgraph: Subgraph;
  existingSimplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  simplifyPropertyKeys: boolean;
}): {
  propertyValue: MinimalPropertyTypeValue;
  updatedSimplifiedPropertyTypeMappings: Record<string, BaseUrl>;
} => {
  const { valueReference, subgraph, simplifyPropertyKeys } = params;

  let simplifiedPropertyTypeMappings =
    params.existingSimplifiedPropertyTypeMappings;

  const isArray = "items" in valueReference;

  if (isArray) {
    return {
      propertyValue: {
        items: {
          oneOf: valueReference.items.oneOf.map((arrayValueReference) => {
            const { propertyValue, updatedSimplifiedPropertyTypeMappings } =
              dereferencePropertyTypeValue({
                valueReference: arrayValueReference,
                subgraph,
                existingSimplifiedPropertyTypeMappings:
                  simplifiedPropertyTypeMappings,
                simplifyPropertyKeys,
              });

            simplifiedPropertyTypeMappings =
              updatedSimplifiedPropertyTypeMappings;

            return propertyValue;
          }) as [MinimalPropertyTypeValue, ...MinimalPropertyTypeValue[]],
        },
        maxItems: valueReference.maxItems,
        minItems: valueReference.minItems,
        type: "array",
      },
      updatedSimplifiedPropertyTypeMappings: simplifiedPropertyTypeMappings,
    };
  }

  const isObject = "properties" in valueReference;
  if (isObject) {
    return {
      propertyValue: {
        properties: Object.values(valueReference.properties).reduce<
          MinimalPropertyObject["properties"]
        >((accumulator, propertyRefSchema) => {
          const isInnerArray = "items" in propertyRefSchema;
          const propertyTypeId = isInnerArray
            ? propertyRefSchema.items.$ref
            : propertyRefSchema.$ref;

          const propertyType = getPropertyTypeById(subgraph, propertyTypeId);

          if (!propertyType) {
            throw new Error(
              `Could not find property with id ${propertyTypeId}`,
            );
          }

          const {
            dereferencedPropertyType,
            updatedSimplifiedPropertyTypeMappings,
            // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the function will be hoisted
          } = dereferencePropertyType({
            propertyTypeId: propertyType.schema.$id,
            subgraph,
            existingSimplifiedPropertyTypeMappings:
              simplifiedPropertyTypeMappings,
            simplifyPropertyKeys,
          });

          simplifiedPropertyTypeMappings =
            updatedSimplifiedPropertyTypeMappings;

          const propertyTypeBaseUrl = extractBaseUrl(propertyType.schema.$id);

          let propertyKey: string | BaseUrl = propertyTypeBaseUrl;

          if (simplifyPropertyKeys) {
            const { simplifiedTypeId, updatedTypeMappings } =
              generateSimplifiedTypeId({
                title: propertyType.schema.title,
                typeIdOrBaseUrl: propertyTypeBaseUrl,
                existingTypeMappings: simplifiedPropertyTypeMappings,
              });

            propertyKey = simplifiedTypeId;

            simplifiedPropertyTypeMappings = updatedTypeMappings;
          }

          accumulator[propertyKey] = isInnerArray
            ? {
                type: "array",
                items: dereferencedPropertyType,
                minItems: propertyRefSchema.minItems,
                maxItems: propertyRefSchema.maxItems,
              }
            : dereferencedPropertyType;

          return accumulator;
        }, {}),
        required: simplifyPropertyKeys
          ? valueReference.required
            ? atLeastOne(
                valueReference.required.map((requiredPropertyBaseUrl) => {
                  const simplifiedPropertyId = Object.entries(
                    simplifiedPropertyTypeMappings,
                  ).find(
                    ([_, propertyBaseUrl]) =>
                      propertyBaseUrl === requiredPropertyBaseUrl,
                  )?.[0];

                  return simplifiedPropertyId ?? requiredPropertyBaseUrl;
                }),
              )
            : undefined
          : valueReference.required,
        additionalProperties: false,
        type: "object",
      },
      updatedSimplifiedPropertyTypeMappings: simplifiedPropertyTypeMappings,
    };
  }

  const dataType = getDataTypeById(subgraph, valueReference.$ref);
  if (!dataType) {
    throw new Error(
      `Could not find data type with id ${valueReference.$ref} in subgraph`,
    );
  }

  const {
    $id: _$id,
    $schema: _$schema,
    kind: _kind,
    ...minimalDataType
  } = dataType.schema;

  return {
    propertyValue: minimalDataType,
    updatedSimplifiedPropertyTypeMappings: simplifiedPropertyTypeMappings,
  };
};

const dereferencePropertyType = (params: {
  propertyTypeId: VersionedUrl;
  subgraph: Subgraph;
  existingSimplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  simplifyPropertyKeys: boolean;
}): {
  dereferencedPropertyType: DereferencedPropertyType;
  updatedSimplifiedPropertyTypeMappings: Record<string, BaseUrl>;
} => {
  const { propertyTypeId, subgraph, simplifyPropertyKeys } = params;

  let simplifiedPropertyTypeMappings =
    params.existingSimplifiedPropertyTypeMappings;

  const propertyType = getPropertyTypeById(subgraph, propertyTypeId);

  if (!propertyType) {
    throw new Error(`Could not find property with id ${propertyTypeId}`);
  }

  const permittedValues = propertyType.schema.oneOf.map((reference) => {
    const { updatedSimplifiedPropertyTypeMappings, propertyValue } =
      dereferencePropertyTypeValue({
        valueReference: reference,
        subgraph,
        existingSimplifiedPropertyTypeMappings: simplifiedPropertyTypeMappings,
        simplifyPropertyKeys,
      });

    simplifiedPropertyTypeMappings = updatedSimplifiedPropertyTypeMappings;

    return propertyValue;
  }) as [MinimalPropertyTypeValue, ...MinimalPropertyTypeValue[]];

  return {
    dereferencedPropertyType: {
      $id: propertyType.schema.$id,
      title: propertyType.schema.title,
      description: propertyType.schema.description,
      oneOf: permittedValues,
    },
    updatedSimplifiedPropertyTypeMappings: simplifiedPropertyTypeMappings,
  };
};

/**
 * For a given entityTypeId and a subgraph containing all its dependencies, return a single JSON schema with the following resolved:
 * 1. its parent types
 * 2. its property types
 * 3. property types and data types which its property types refer to

 * Does not dereference 'links', because 'links' is not an expected part of the data object the dereferenced schema describes.
 *
 * If called with `simplifyPropertyKeys` set to `true`, the property keys in the schema will be simplified from BaseUrls to simple strings. The mapping back to BaseUrls is returned as simplifiedPropertyTypeMappings.
 *
 * See the associated .test.ts file for example input/output
 */
export const dereferenceEntityType = <
  SimplifyPropertyKeys extends boolean | undefined = undefined,
>(params: {
  entityTypeId: VersionedUrl;
  subgraph: Subgraph;
  simplifyPropertyKeys?: SimplifyPropertyKeys;
}): {
  isLink: boolean;
  schema: DereferencedEntityType<
    SimplifyPropertyKeys extends true ? string : BaseUrl
  >;
  simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
} => {
  const { entityTypeId, subgraph, simplifyPropertyKeys = false } = params;

  let simplifiedPropertyTypeMappings: Record<string, BaseUrl> = {};

  const entityTypeWithAncestors = getEntityTypeAndParentsById(
    subgraph,
    entityTypeId,
  );

  const isLink = entityTypeWithAncestors.some(
    (entityType) => entityType.schema.$id === linkEntityTypeUrl,
  );

  let labelProperty: BaseUrl | undefined;
  const mergedProperties: DereferencedEntityType<
    string | BaseUrl
  >["properties"] = {};

  const requiredProperties: Set<BaseUrl> = new Set();

  for (const entityType of entityTypeWithAncestors) {
    for (const requiredProp of entityType.schema.required ?? []) {
      requiredProperties.add(requiredProp as BaseUrl);
    }

    /**
     * Take the label property from the first entity type in the inheritance chain which has one.
     * The first item in the array is the entity type itself.
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

      const existingProperty = simplifyPropertyKeys
        ? simplifiedPropertyTypeMappings[baseUrl]
          ? mergedProperties[simplifiedPropertyTypeMappings[baseUrl]]
          : undefined
        : mergedProperties[baseUrl];

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
        let propertyKey: string | BaseUrl = baseUrl;

        if (simplifyPropertyKeys) {
          const propertyType = getPropertyTypeById(subgraph, propertyTypeId);

          if (!propertyType) {
            throw new Error(
              `Could not find property with id ${propertyTypeId}`,
            );
          }

          const { simplifiedTypeId, updatedTypeMappings } =
            generateSimplifiedTypeId({
              title: propertyType.schema.title,
              typeIdOrBaseUrl: baseUrl,
              existingTypeMappings: simplifiedPropertyTypeMappings,
            });

          simplifiedPropertyTypeMappings = updatedTypeMappings;

          propertyKey = simplifiedTypeId;
        }

        const {
          dereferencedPropertyType,
          updatedSimplifiedPropertyTypeMappings,
        } = dereferencePropertyType({
          propertyTypeId,
          subgraph,
          existingSimplifiedPropertyTypeMappings:
            simplifiedPropertyTypeMappings,
          simplifyPropertyKeys,
        });

        simplifiedPropertyTypeMappings = updatedSimplifiedPropertyTypeMappings;

        mergedProperties[propertyKey] = isArray
          ? { ...propertyRefSchema, items: dereferencedPropertyType }
          : dereferencedPropertyType;
      }
    }
  }

  const mergedLinks: DereferencedEntityType["links"] = {};
  for (const entityType of entityTypeWithAncestors) {
    for (const [versionedUrl, linkSchema] of typedEntries(
      entityType.schema.links ?? {},
    )) {
      mergedLinks[versionedUrl] ??= linkSchema;
    }
  }

  const entityType = entityTypeWithAncestors[0]!;
  if (entityType.schema.$id !== entityTypeId) {
    throw new Error(
      `Expected the entity type with id ${entityTypeId} in the first position in the entityTypeWithAncestors array, got ${entityType.schema.$id}.`,
    );
  }

  const mergedSchema: DereferencedEntityType<
    SimplifyPropertyKeys extends true ? string : BaseUrl
  > = {
    $id: entityType.schema.$id,
    title: entityType.schema.title,
    description: entityType.schema.description,
    labelProperty,
    links: mergedLinks,
    properties: mergedProperties,
    additionalProperties: false,
    required: atLeastOne([...requiredProperties]),
  };

  return {
    isLink,
    schema: mergedSchema,
    simplifiedPropertyTypeMappings,
  };
};
