import type { JsonValue, Subgraph as SubgraphBp } from "@blockprotocol/graph";
import {
  getPropertyTypeById as getPropertyTypeByIdBp,
  getPropertyTypeByVertexId as getPropertyTypeByVertexIdBp,
  getPropertyTypes as getPropertyTypesBp,
  getPropertyTypesByBaseUrl as getPropertyTypesByBaseUrlBp,
} from "@blockprotocol/graph/stdlib";
import type {
  DataTypeReference,
  PropertyTypeReference,
  ValueOrArray,
} from "@blockprotocol/type-system";
import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";

import type { OntologyTypeVertexId, Subgraph } from "../../../main.js";
import {
  getJsonSchemaTypeFromValue,
  mustGetDataTypeById,
} from "./data-type.js";
import {
  getEntityTypeAndParentsById,
  getEntityTypeById,
} from "./entity-type.js";

/**
 * Returns all `PropertyTypeWithMetadata`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getPropertyTypes = (
  subgraph: Subgraph,
): PropertyTypeWithMetadata[] =>
  getPropertyTypesBp(
    subgraph as unknown as SubgraphBp,
  ) as PropertyTypeWithMetadata[];

/**
 * Gets a `PropertyTypeWithMetadata` by its `VersionedUrl` from within the vertices of the subgraph. Returns `undefined`
 * if the property type couldn't be found.
 *
 * @param subgraph
 * @param propertyTypeId
 * @throws if the vertex isn't a `PropertyTypeVertex`
 */
export const getPropertyTypeById = (
  subgraph: Subgraph,
  propertyTypeId: VersionedUrl,
): PropertyTypeWithMetadata | undefined =>
  getPropertyTypeByIdBp(subgraph as unknown as SubgraphBp, propertyTypeId) as
    | PropertyTypeWithMetadata
    | undefined;

/**
 * Gets a `PropertyTypeWithMetadata` by its `OntologyTypeVertexId` from within the vertices of the subgraph. Returns
 * `undefined` if the property type couldn't be found.
 *
 * @param subgraph
 * @param vertexId
 * @throws if the vertex isn't a `PropertyTypeVertex`
 */
export const getPropertyTypeByVertexId = (
  subgraph: Subgraph,
  vertexId: OntologyTypeVertexId,
): PropertyTypeWithMetadata | undefined =>
  getPropertyTypeByVertexIdBp(subgraph as unknown as SubgraphBp, vertexId) as
    | PropertyTypeWithMetadata
    | undefined;

/**
 * Returns all `PropertyTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUrl`
 *
 * @param subgraph
 * @param baseUrl
 */
export const getPropertyTypesByBaseUrl = (
  subgraph: Subgraph,
  baseUrl: BaseUrl,
): PropertyTypeWithMetadata[] =>
  getPropertyTypesByBaseUrlBp(
    subgraph as unknown as SubgraphBp,
    baseUrl,
  ) as PropertyTypeWithMetadata[];

export const getPropertyTypeForEntity = (
  subgraph: Subgraph,
  entityTypeId: VersionedUrl,
  propertyBaseUrl: BaseUrl,
): {
  propertyType: PropertyType;
  refSchema: EntityType["properties"][string];
} => {
  const entityTypeAndParents = getEntityTypeAndParentsById(
    subgraph,
    entityTypeId,
  );

  for (const entityType of entityTypeAndParents) {
    const refSchema = entityType.schema.properties[propertyBaseUrl];

    if (refSchema) {
      const propertyTypeId =
        "items" in refSchema ? refSchema.items.$ref : refSchema.$ref;
      const propertyTypeWithMetadata = getPropertyTypeById(
        subgraph,
        propertyTypeId,
      );
      if (!propertyTypeWithMetadata) {
        throw new Error(
          `Property type ${propertyTypeId} not found in subgraph`,
        );
      }
      return {
        propertyType: propertyTypeWithMetadata.schema,
        refSchema,
      };
    }
  }

  throw new Error(
    `Property ${propertyBaseUrl} not found on entity type ${entityTypeId} or any ancestors`,
  );
};

/**
 * Guess the expected data type schema(s) for a given property type and value.
 *
 * Only handles the simplest cases:
 * 1. Expected value is a single data type
 * 2. Expected value is an array of a single data type
 * 3. Expected value is an array of mixed data types
 *    – matching schemas are returned in order of the array's values, if all values could be matched to an expected
 * schema
 * 4. Expected value is one of multiple singular data types
 *
 * @todo handle more complex mixed values and arrays, nested arrays and property objects. Will need a recursive
 *   function
 */
export const guessSchemaForPropertyValue = (
  subgraph: Subgraph,
  propertyType: PropertyType,
  value: JsonValue,
): {
  schema:
    | DataTypeWithMetadata["schema"]
    | DataTypeWithMetadata["schema"][]
    | null;
  isArrayOfSchema: boolean;
} => {
  const firstSchema = propertyType.oneOf[0];

  if (propertyType.oneOf.length === 1) {
    // There's only one top-level potential value

    if ("$ref" in firstSchema) {
      // The only expected value is a single data type
      const guessedSchema = mustGetDataTypeById(
        subgraph,
        firstSchema.$ref,
      ).schema;
      const isArrayOfSchema = false;
      return {
        schema: guessedSchema,
        isArrayOfSchema,
      };
    }

    if ("items" in firstSchema) {
      // The only expected value is an array
      const isArrayOfSchema = true;
      const possibleArrayValues = firstSchema.items.oneOf;

      if (possibleArrayValues.length === 1) {
        // The array only has one potential value
        const possibleArrayValue = possibleArrayValues[0];

        if ("$ref" in possibleArrayValue) {
          // It's an array of a single data type
          const guessedSchema = mustGetDataTypeById(
            subgraph,
            possibleArrayValue.$ref,
          ).schema;
          return {
            schema: guessedSchema,
            isArrayOfSchema,
          };
        } else {
          // This is a nested array or property object
          return {
            schema: null,
            isArrayOfSchema,
          };
        }
      } else {
        // There are multiple potential values of the expected array
        if (possibleArrayValues.every((schema) => "$ref" in schema)) {
          // The potential values of the array are all data types
          if (!Array.isArray(value)) {
            throw new Error("Non-array value provided for array property type");
          }

          const possibleDataTypes = possibleArrayValues.map((schema) =>
            mustGetDataTypeById(subgraph, (schema as DataTypeReference).$ref),
          );

          // Guess which of the possible schemas each value corresponds to, based on the value's type
          const guessedSchemas = value.map((innerValue) => {
            const jsonSchemaType = getJsonSchemaTypeFromValue(innerValue);

            const dataType = possibleDataTypes.find(
              ({ schema }) => schema.type === jsonSchemaType,
            );

            if (!dataType) {
              // None of the available schemas match the value's type
              return null;
            }
            return dataType.schema;
          });

          const allSchemasFound = guessedSchemas.every(
            (schema): schema is DataTypeWithMetadata["schema"] => !!schema,
          );

          if (!allSchemasFound) {
            return {
              schema: null,
              isArrayOfSchema,
            };
          }

          return {
            schema: guessedSchemas,
            isArrayOfSchema,
          };
        }
        return {
          schema: null,
          isArrayOfSchema,
        };
      }
    }
  } else {
    // There are multiple potential top-level values

    // eslint-disable-next-line no-lonely-if -- TODO add more logic to the else branch
    if (propertyType.oneOf.every((schema) => "$ref" in schema)) {
      // Each possible value is a single data type

      const possibleDataTypes = propertyType.oneOf.map((schema) =>
        mustGetDataTypeById(subgraph, (schema as DataTypeReference).$ref),
      );

      const guessedDataType = possibleDataTypes.find(({ schema }) => {
        const jsonSchemaType = getJsonSchemaTypeFromValue(value);
        return schema.type === jsonSchemaType;
      });

      return {
        schema: guessedDataType?.schema ?? null,
        isArrayOfSchema: false,
      };
    }
  }

  // There are multiple potential value types for the property type
  return {
    schema: null,
    isArrayOfSchema: propertyType.oneOf.every((schema) => "items" in schema),
  };
};

/**
 * Adds all property types referenced by the given property reference objects to the provided map,
 * including from nested property objects each property type may further reference.
 *
 * The subgraph must be a result of having queried for an entity type with sufficiently high depth
 * for constrainsPropertiesOn to contain all property types referenced by the entity type and its properties.
 *
 * @param propertyReferenceObjects The values of an entity type or property type's 'properties' object
 * @param subgraph a subgraph which is assumed to contain all relevant property types
 * @param propertyTypesMap the map to add the property types to
 *
 * @return nothing, because the caller provided the map
 *
 * @throws if the subgraph does not contain a property type referenced by the given reference objects
 *
 * @todo this is a good candidate for moving to somewhere shared, possibly @blockprotocol/graph's stdlib
 */
const addPropertyTypesToMapFromReferences = (
  propertyReferenceObjects: ValueOrArray<PropertyTypeReference>[],
  subgraph: Subgraph,
  propertyTypesMap: Map<string, PropertyTypeWithMetadata>,
) => {
  for (const referenceObject of propertyReferenceObjects) {
    const propertyUrl =
      "items" in referenceObject
        ? referenceObject.items.$ref
        : referenceObject.$ref;

    if (!propertyTypesMap.has(propertyUrl)) {
      const propertyType = getPropertyTypeById(subgraph, propertyUrl);

      if (propertyType) {
        for (const childProp of propertyType.schema.oneOf) {
          if ("type" in childProp && childProp.type === "object") {
            addPropertyTypesToMapFromReferences(
              Object.values(childProp.properties),
              subgraph,
              propertyTypesMap,
            );
          }
        }
      }

      if (propertyType) {
        propertyTypesMap.set(propertyUrl, propertyType);
      }
    }
  }
};

/**
 * Gets a map of all property types referenced by the entity type to the provided map,
 * including from any parents in its inheritance chain and nested property objects,
 *
 * The subgraph must be a result of having queried for an entity type with sufficiently high depth
 * for constrainsPropertiesOn and inheritsFrom to contain all parent entity types and property types they reference.
 *
 * @param entityType The entity type to provide properties for
 * @param subgraph a subgraph which is assumed to contain all relevant property types
 *
 * @throws Error if the subgraph does not contain a property type or parent entity type relied on by the entity type
 *
 * @todo this is a good candidate for moving to somewhere shared, possibly @blockprotocol/graph's stdlib
 */
export const getPropertyTypesForEntityType = (
  entityType: EntityType,
  subgraph: Subgraph,
  propertyTypesMap = new Map<string, PropertyTypeWithMetadata>(),
) => {
  addPropertyTypesToMapFromReferences(
    Object.values(entityType.properties),
    subgraph,
    propertyTypesMap,
  );

  for (const parentReference of entityType.allOf ?? []) {
    const parentEntityType = getEntityTypeById(subgraph, parentReference.$ref);

    if (!parentEntityType) {
      throw new Error(
        `Could not find parent entity type ${parentReference.$ref} for entity type ${entityType.$id}`,
      );
    }

    getPropertyTypesForEntityType(
      parentEntityType.schema,
      subgraph,
      propertyTypesMap,
    );
  }

  return propertyTypesMap;
};
