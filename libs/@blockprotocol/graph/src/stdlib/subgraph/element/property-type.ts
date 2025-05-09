import type {
  BaseUrl,
  EntityType,
  PropertyType,
  PropertyTypeReference,
  PropertyTypeWithMetadata,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { extractBaseUrl, extractVersion } from "@blockprotocol/type-system";
import { typedValues } from "@local/advanced-types/typed-entries";

import type {
  OntologyTypeVertexId,
  OntologyVertices,
  Subgraph,
} from "../../../types/subgraph.js";
import { isPropertyTypeVertex } from "../../../types/subgraph/vertices.js";
import {
  getBreadthFirstEntityTypesAndParents,
  getEntityTypeById,
} from "./entity-type.js";

/**
 * Returns all `PropertyTypeWithMetadata`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getPropertyTypes = (
  subgraph: Subgraph,
): PropertyTypeWithMetadata[] => {
  return typedValues(subgraph.vertices).flatMap((versionObject) =>
    typedValues(versionObject)
      .filter(isPropertyTypeVertex)
      .map((vertex) => vertex.inner),
  );
};

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
): PropertyTypeWithMetadata | undefined => {
  const [baseUrl, version] = [
    extractBaseUrl(propertyTypeId),
    extractVersion(propertyTypeId),
  ];
  const vertex = (subgraph.vertices as OntologyVertices)[baseUrl]?.[
    version.toString()
  ];

  if (!vertex) {
    return undefined;
  }

  if (!isPropertyTypeVertex(vertex)) {
    throw new Error(`expected property type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

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
): PropertyTypeWithMetadata | undefined => {
  const vertex = (subgraph.vertices as OntologyVertices)[vertexId.baseId]?.[
    vertexId.revisionId.toString()
  ];

  if (!vertex) {
    return undefined;
  }

  if (!isPropertyTypeVertex(vertex)) {
    throw new Error(`expected property type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Returns all `PropertyTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUrl`
 *
 * @param subgraph
 * @param baseUrl
 */
export const getPropertyTypesByBaseUrl = (
  subgraph: Subgraph,
  baseUrl: BaseUrl,
): PropertyTypeWithMetadata[] => {
  const versionObject = (subgraph.vertices as OntologyVertices)[baseUrl];

  if (!versionObject) {
    return [];
  }
  const propertyTypeVertices = typedValues(versionObject);

  return propertyTypeVertices.map((vertex) => {
    if (!isPropertyTypeVertex(vertex)) {
      throw new Error(`expected property type vertex but got: ${vertex.kind}`);
    }

    return vertex.inner;
  });
};

export const getPropertyTypeForEntity = (
  subgraph: Subgraph,
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]],
  propertyBaseUrl: BaseUrl,
): {
  propertyType: PropertyType;
  refSchema: EntityType["properties"][BaseUrl];
} => {
  const entityTypeAndParents = getBreadthFirstEntityTypesAndParents(
    subgraph,
    entityTypeIds,
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
    `Property ${propertyBaseUrl} not found on entity types ${entityTypeIds.join(", ")} or any ancestors`,
  );
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
 * Gets a map of all propertyTypeIds referenced by the entity type to the full property type,
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
