import type { Subgraph } from "@blockprotocol/graph";
import {
  getDataTypeById,
  getEntityTypeAndParentsById,
  getPropertyTypeById,
} from "@blockprotocol/graph/stdlib";
import type {
  BaseUrl,
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
import {
  atLeastOne,
  compareOntologyTypeVersions,
  componentsFromVersionedUrl,
  extractBaseUrl,
  extractVersion,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { generateSimplifiedTypeId } from "../infer-entities/shared/generate-simplified-type-id.js";

type MinimalDataType = DistributiveOmit<DataType, "$schema" | "kind" | "allOf">;

export type MinimalPropertyObject = PropertyValueObject<
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
> = Pick<
  EntityType,
  "$id" | "description" | "links" | "required" | "title" | "labelProperty"
> & {
  properties: Record<
    PropertyTypeKey,
    DereferencedPropertyType | PropertyValueArray<DereferencedPropertyType>
  >;
  additionalProperties: false;
};

export type DereferencedEntityTypeWithSimplifiedKeys = {
  isLink: boolean;
  parentIds: VersionedUrl[];
  schema: DereferencedEntityType<string>;
  simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  reverseSimplifiedPropertyTypeMappings: Record<BaseUrl, string>;
};

const dereferencePropertyTypeValue = (params: {
  valueReference: PropertyValues;
  subgraph: Subgraph;
  existingSimplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  existingReverseSimplifiedPropertyTypeMappings: Record<BaseUrl, string>;
  simplifyPropertyKeys: boolean;
}): {
  propertyValue: MinimalPropertyTypeValue;
  updatedSimplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  updatedReverseSimplifiedPropertyTypeMappings: Record<BaseUrl, string>;
} => {
  const { valueReference, subgraph, simplifyPropertyKeys } = params;

  let simplifiedPropertyTypeMappings =
    params.existingSimplifiedPropertyTypeMappings;
  let reverseSimplifiedPropertyTypeMappings =
    params.existingReverseSimplifiedPropertyTypeMappings;

  const isArray = "items" in valueReference;

  if (isArray) {
    return {
      propertyValue: {
        items: {
          oneOf: valueReference.items.oneOf.map((arrayValueReference) => {
            const {
              propertyValue,
              updatedSimplifiedPropertyTypeMappings,
              updatedReverseSimplifiedPropertyTypeMappings,
            } = dereferencePropertyTypeValue({
              valueReference: arrayValueReference,
              subgraph,
              existingSimplifiedPropertyTypeMappings:
                simplifiedPropertyTypeMappings,
              existingReverseSimplifiedPropertyTypeMappings:
                reverseSimplifiedPropertyTypeMappings,
              simplifyPropertyKeys,
            });

            simplifiedPropertyTypeMappings =
              updatedSimplifiedPropertyTypeMappings;

            reverseSimplifiedPropertyTypeMappings =
              updatedReverseSimplifiedPropertyTypeMappings;

            return propertyValue;
          }) as [MinimalPropertyTypeValue, ...MinimalPropertyTypeValue[]],
        },
        maxItems: valueReference.maxItems,
        minItems: valueReference.minItems,
        type: "array",
      },
      updatedSimplifiedPropertyTypeMappings: simplifiedPropertyTypeMappings,
      updatedReverseSimplifiedPropertyTypeMappings:
        reverseSimplifiedPropertyTypeMappings,
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
            existingReverseSimplifiedPropertyTypeMappings:
              reverseSimplifiedPropertyTypeMappings,
            simplifyPropertyKeys,
          });

          simplifiedPropertyTypeMappings =
            updatedSimplifiedPropertyTypeMappings;

          const propertyTypeBaseUrl = extractBaseUrl(propertyType.schema.$id);

          let propertyKey: BaseUrl = propertyTypeBaseUrl;

          if (simplifyPropertyKeys) {
            const {
              simplifiedTypeId,
              updatedTypeMappings,
              updatedReverseTypeMappings,
            } = generateSimplifiedTypeId({
              title: propertyType.schema.title,
              typeIdOrBaseUrl: propertyTypeBaseUrl,
              existingTypeMappings: simplifiedPropertyTypeMappings,
              existingReverseTypeMappings:
                reverseSimplifiedPropertyTypeMappings,
            });

            propertyKey = simplifiedTypeId as BaseUrl;

            simplifiedPropertyTypeMappings = updatedTypeMappings;
            reverseSimplifiedPropertyTypeMappings = updatedReverseTypeMappings;
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
                  )?.[0] as BaseUrl | undefined;

                  return simplifiedPropertyId ?? requiredPropertyBaseUrl;
                }),
              )
            : undefined
          : valueReference.required,
        additionalProperties: false,
        type: "object",
      },
      updatedSimplifiedPropertyTypeMappings: simplifiedPropertyTypeMappings,
      updatedReverseSimplifiedPropertyTypeMappings:
        reverseSimplifiedPropertyTypeMappings,
    };
  }

  const dataType = getDataTypeById(subgraph, valueReference.$ref);
  if (!dataType) {
    throw new Error(
      `Could not find data type with id ${valueReference.$ref} in subgraph`,
    );
  }

  const {
    $schema: _$schema,
    kind: _kind,
    allOf: _allOf,
    ...minimalDataType
  } = dataType.schema;

  return {
    propertyValue: minimalDataType,
    updatedSimplifiedPropertyTypeMappings: simplifiedPropertyTypeMappings,
    updatedReverseSimplifiedPropertyTypeMappings:
      reverseSimplifiedPropertyTypeMappings,
  };
};

const dereferencePropertyType = (params: {
  propertyTypeId: VersionedUrl;
  subgraph: Subgraph;
  existingSimplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  existingReverseSimplifiedPropertyTypeMappings: Record<BaseUrl, string>;
  simplifyPropertyKeys: boolean;
}): {
  dereferencedPropertyType: DereferencedPropertyType;
  updatedSimplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  updatedReverseSimplifiedPropertyTypeMappings: Record<BaseUrl, string>;
} => {
  const { propertyTypeId, subgraph, simplifyPropertyKeys } = params;

  let simplifiedPropertyTypeMappings =
    params.existingSimplifiedPropertyTypeMappings;
  let reverseSimplifiedPropertyTypeMappings =
    params.existingReverseSimplifiedPropertyTypeMappings;

  const propertyType = getPropertyTypeById(subgraph, propertyTypeId);

  if (!propertyType) {
    throw new Error(`Could not find property with id ${propertyTypeId}`);
  }

  const permittedValues = propertyType.schema.oneOf.map((reference) => {
    const {
      updatedSimplifiedPropertyTypeMappings,
      updatedReverseSimplifiedPropertyTypeMappings,
      propertyValue,
    } = dereferencePropertyTypeValue({
      valueReference: reference,
      subgraph,
      existingSimplifiedPropertyTypeMappings: simplifiedPropertyTypeMappings,
      existingReverseSimplifiedPropertyTypeMappings:
        reverseSimplifiedPropertyTypeMappings,
      simplifyPropertyKeys,
    });

    simplifiedPropertyTypeMappings = updatedSimplifiedPropertyTypeMappings;
    reverseSimplifiedPropertyTypeMappings =
      updatedReverseSimplifiedPropertyTypeMappings;

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
    updatedReverseSimplifiedPropertyTypeMappings:
      reverseSimplifiedPropertyTypeMappings,
  };
};

type DererencedEntityTypeWithMappings<
  SimplifyPropertyKeys extends boolean | undefined = undefined,
> = {
  isLink: boolean;
  parentIds: VersionedUrl[];
  schema: DereferencedEntityType<
    SimplifyPropertyKeys extends true ? string : BaseUrl
  >;
  simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  reverseSimplifiedPropertyTypeMappings: Record<BaseUrl, string>;
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
}): DererencedEntityTypeWithMappings<SimplifyPropertyKeys> => {
  const { entityTypeId, subgraph, simplifyPropertyKeys = false } = params;

  let simplifiedPropertyTypeMappings: Record<string, BaseUrl> = {};
  let reverseSimplifiedPropertyTypeMappings: Record<BaseUrl, string> = {};

  const entityTypeWithAncestors = getEntityTypeAndParentsById(
    subgraph,
    entityTypeId,
  );

  const isLink = entityTypeWithAncestors.some(
    (entityType) =>
      entityType.schema.$id === blockProtocolEntityTypes.link.entityTypeId,
  );

  let labelProperty: BaseUrl | undefined;
  const mergedProperties: DereferencedEntityType<
    string | BaseUrl
  >["properties"] = {};

  const requiredProperties: Set<BaseUrl> = new Set();

  for (const entityType of entityTypeWithAncestors) {
    for (const requiredProp of entityType.schema.required ?? []) {
      requiredProperties.add(requiredProp);
    }

    /**
     * Take the label property from the first entity type in the inheritance chain which has one.
     * The first item in the array is the entity type itself.
     */
    if (!labelProperty && entityType.schema.labelProperty) {
      labelProperty = entityType.schema.labelProperty;
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
        compareOntologyTypeVersions(
          extractVersion(
            "items" in existingProperty
              ? existingProperty.items.$id
              : existingProperty.$id,
          ),
          version,
        ) < 0
      ) {
        let propertyKey: string | BaseUrl = baseUrl;

        if (simplifyPropertyKeys) {
          const propertyType = getPropertyTypeById(subgraph, propertyTypeId);

          if (!propertyType) {
            throw new Error(
              `Could not find property with id ${propertyTypeId}`,
            );
          }

          const {
            simplifiedTypeId,
            updatedTypeMappings,
            updatedReverseTypeMappings,
          } = generateSimplifiedTypeId({
            title: propertyType.schema.title,
            typeIdOrBaseUrl: baseUrl,
            existingTypeMappings: simplifiedPropertyTypeMappings,
            existingReverseTypeMappings: reverseSimplifiedPropertyTypeMappings,
          });

          simplifiedPropertyTypeMappings = updatedTypeMappings;
          reverseSimplifiedPropertyTypeMappings = updatedReverseTypeMappings;

          propertyKey = simplifiedTypeId;
        }

        const {
          dereferencedPropertyType,
          updatedSimplifiedPropertyTypeMappings,
          updatedReverseSimplifiedPropertyTypeMappings,
        } = dereferencePropertyType({
          propertyTypeId,
          subgraph,
          existingSimplifiedPropertyTypeMappings:
            simplifiedPropertyTypeMappings,
          existingReverseSimplifiedPropertyTypeMappings:
            reverseSimplifiedPropertyTypeMappings,
          simplifyPropertyKeys,
        });

        simplifiedPropertyTypeMappings = updatedSimplifiedPropertyTypeMappings;
        reverseSimplifiedPropertyTypeMappings =
          updatedReverseSimplifiedPropertyTypeMappings;

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

  const entityType = entityTypeWithAncestors[0];
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
    required: atLeastOne(
      simplifyPropertyKeys
        ? [...requiredProperties].map((baseUrl) => {
            const simpleTitle = reverseSimplifiedPropertyTypeMappings[baseUrl];

            if (!simpleTitle) {
              throw new Error(`Could not find simplified title for ${baseUrl}`);
            }

            return simpleTitle as BaseUrl;
          })
        : [...requiredProperties],
    ),
  };

  return {
    isLink,
    parentIds: entityTypeWithAncestors.map((ancestor) => ancestor.schema.$id),
    schema: mergedSchema,
    simplifiedPropertyTypeMappings,
    reverseSimplifiedPropertyTypeMappings,
  };
};
