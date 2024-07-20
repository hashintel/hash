import type {
  BaseUrl,
  extractBaseUrl,
  extractVersion,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import type { EntityTypeWithMetadata } from "../../../types/ontology/entity-type.js";
import type {
  OntologyTypeVertexId,
  Subgraph,
} from "../../../types/subgraph.js";
import { isEntityTypeVertex } from "../../../types/subgraph/vertices.js";
import { typedValues } from "../../../util.js";

/**
 * Returns all `EntityTypeWithMetadata`s within the vertices of the subgraph.
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
 * @throws If the vertex isn't a `EntityTypeVertex`.
 */
export const getEntityTypeById = (
  subgraph: Subgraph,
  entityTypeId: VersionedUrl,
): EntityTypeWithMetadata | undefined => {
  const [baseUrl, version] = [
    extractBaseUrl(entityTypeId),
    extractVersion(entityTypeId),
  ];
  const vertex = subgraph.vertices[baseUrl]?.[version];

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
 * @throws If the vertex isn't a `EntityTypeVertex`.
 */
export const getEntityTypeByVertexId = (
  subgraph: Subgraph,
  vertexId: OntologyTypeVertexId,
): EntityTypeWithMetadata | undefined => {
  const vertex = subgraph.vertices[vertexId.baseId]?.[vertexId.revisionId];

  if (!vertex) {
    return undefined;
  }

  if (!isEntityTypeVertex(vertex)) {
    throw new Error(`expected entity type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Returns all `EntityTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUrl`.
 *
 * @param subgraph
 * @param baseUrl
 */
export const getEntityTypesByBaseUrl = (
  subgraph: Subgraph,
  baseUrl: BaseUrl,
): EntityTypeWithMetadata[] => {
  const versionObject = subgraph.vertices[baseUrl];

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
