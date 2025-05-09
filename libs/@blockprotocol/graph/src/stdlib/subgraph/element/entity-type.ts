import type {
  BaseUrl,
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { extractBaseUrl, extractVersion } from "@blockprotocol/type-system";
import { typedValues } from "@local/advanced-types/typed-entries";

import type {
  OntologyTypeVertexId,
  OntologyVertices,
  Subgraph,
} from "../../../types/subgraph.js";
import { isEntityTypeVertex } from "../../../types/subgraph/vertices.js";

/**
 * Returns all `EntityTypeWithMetadata`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getEntityTypes = (
  subgraph: Subgraph,
): EntityTypeWithMetadata[] => {
  return typedValues(subgraph.vertices).flatMap((versionObject) =>
    typedValues(versionObject)
      .filter(isEntityTypeVertex)
      .map((vertex) => vertex.inner),
  );
};

/**
 * Gets an `EntityTypeWithMetadata` by its `VersionedUrl` from within the vertices of the subgraph. Returns `undefined`
 * if the entity type couldn't be found.
 *
 * @param subgraph
 * @param entityTypeId
 * @throws if the vertex isn't a `EntityTypeVertex`
 */
export const getEntityTypeById = (
  subgraph: Subgraph,
  entityTypeId: VersionedUrl,
): EntityTypeWithMetadata | undefined => {
  const [baseUrl, version] = [
    extractBaseUrl(entityTypeId),
    extractVersion(entityTypeId),
  ];
  const vertex = (subgraph.vertices as OntologyVertices)[baseUrl]?.[
    version.toString()
  ];

  if (!vertex) {
    return undefined;
  }

  if (!isEntityTypeVertex(vertex)) {
    throw new Error(`expected entity type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Gets a `EntityTypeWithMetadata` by its `OntologyTypeVertexId` from within the vertices of the subgraph. Returns
 * `undefined` if the entity type couldn't be found.
 *
 * @param subgraph
 * @param vertexId
 * @throws if the vertex isn't a `EntityTypeVertex`
 */
export const getEntityTypeByVertexId = (
  subgraph: Subgraph,
  vertexId: OntologyTypeVertexId,
): EntityTypeWithMetadata | undefined => {
  const vertex = (subgraph.vertices as OntologyVertices)[vertexId.baseId]?.[
    vertexId.revisionId.toString()
  ];

  if (!vertex) {
    return undefined;
  }

  if (!isEntityTypeVertex(vertex)) {
    throw new Error(`expected entity type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Returns all `EntityTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUrl`
 *
 * @param subgraph
 * @param baseUrl
 */
export const getEntityTypesByBaseUrl = (
  subgraph: Subgraph,
  baseUrl: BaseUrl,
): EntityTypeWithMetadata[] => {
  const versionObject = (subgraph.vertices as OntologyVertices)[baseUrl];

  if (!versionObject) {
    return [];
  }
  const entityTypeVertices = typedValues(versionObject);

  return entityTypeVertices.map((vertex) => {
    if (!isEntityTypeVertex(vertex)) {
      throw new Error(`expected entity type vertex but got: ${vertex.kind}`);
    }

    return vertex.inner;
  });
};

/**
 * Gets an array of `EntityTypeWithMetadata` containing the requested entity type and all its ancestors
 * i.e. entity types it inherits from, whether directly or indirectly.
 *
 * @param subgraph a subgraph containing the entity type and its ancestors
 * @param entityTypeId the `VersionedUrl` of the entity type
 * @throws Error if the entity type or any of its ancestors aren't present in the subgraph
 * @returns EntityTypeWithMetadata[] an array of `EntityTypeWithMetadata`, where the first element is the entity type
 */
export const getEntityTypeAndParentsById = (
  subgraph: Subgraph,
  entityTypeId: VersionedUrl,
): EntityTypeWithMetadata[] => {
  const entityType = getEntityTypeById(subgraph, entityTypeId);

  if (!entityType) {
    throw new Error(`Entity type ${entityTypeId} not found in subgraph`);
  }

  const parentIds = (entityType.schema.allOf ?? []).map(
    (parent) => parent.$ref,
  );

  // Return the entity type, followed by its ancestors
  return [
    entityType,
    ...parentIds.flatMap((parentId) =>
      getEntityTypeAndParentsById(subgraph, parentId),
    ),
  ];
};

/**
 * Gets an array of `EntityTypeWithMetadata` containing the requested entity types and all their ancestors
 * i.e. entity types they inherit from, whether directly or indirectly, ordered for breadth-first traversal.
 *
 * Note that each EntityType will only appear once in the result. If an EntityType appears multiple times in the
 * inheritance chains of different requested EntityTypes, it will only appear in the position it is first encountered.
 *
 * @param subgraph a subgraph containing the entity types and their ancestors
 * @param entityTypeIds the `VersionedUrl`s of the entity types
 * @throws Error if any requested entity type or any of its ancestors aren't present in the subgraph
 * @returns EntityTypeWithMetadata[] an array containing the requested entity types and their ancestors, breadth-first.
 */
export const getBreadthFirstEntityTypesAndParents = (
  subgraph: Subgraph,
  entityTypeIds: VersionedUrl[],
): EntityTypeWithMetadata[] => {
  const visited = new Set<VersionedUrl>();
  const queue: VersionedUrl[] = [...entityTypeIds].toSorted();
  const result: EntityTypeWithMetadata[] = [];

  while (queue.length > 0) {
    const currentEntityTypeId = queue.shift()!;

    if (!visited.has(currentEntityTypeId)) {
      visited.add(currentEntityTypeId);
      const entityType = getEntityTypeById(subgraph, currentEntityTypeId);

      if (!entityType) {
        throw new Error(
          `Entity type ${currentEntityTypeId} not found in subgraph`,
        );
      }

      result.push(entityType);

      for (const parentId of entityType.schema.allOf?.map(
        (parent) => parent.$ref,
      ) ?? []) {
        if (!visited.has(parentId)) {
          queue.push(parentId);
        }
      }
    }
  }

  return result;
};

/**
 * Gets an array of `EntityTypeWithMetadata` containing the requested entity type and all its descendants
 * i.e. entity types which inherit from it, whether directly or indirectly.
 *
 * @param subgraph a subgraph containing the entity type and its descendants
 * @param entityTypeId the `VersionedUrl` of the entity type
 * @throws Error if the entity type or any of its descendants aren't present in the subgraph
 * @returns EntityTypeWithMetadata[] an array of `EntityTypeWithMetadata`, where the first element is the entity type
 */
export const getEntityTypeAndDescendantsById = (
  subgraph: Subgraph,
  entityTypeId: VersionedUrl,
): EntityTypeWithMetadata[] => {
  const entityType = getEntityTypeById(subgraph, entityTypeId);

  if (!entityType) {
    throw new Error(`Entity type ${entityTypeId} not found in subgraph`);
  }

  const descendants = getEntityTypes(subgraph).filter((type) =>
    (type.schema.allOf ?? []).some((parent) => parent.$ref === entityTypeId),
  );

  // Return the entity type, followed by its ancestors
  return [
    entityType,
    ...descendants.flatMap(({ schema }) =>
      getEntityTypeAndDescendantsById(subgraph, schema.$id),
    ),
  ];
};
