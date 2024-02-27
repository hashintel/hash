import {
  BaseUrl,
  extractBaseUrl,
  extractVersion,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import { PropertyTypeWithMetadata } from "../../../types/ontology/property-type.js";
import { OntologyTypeVertexId, Subgraph } from "../../../types/subgraph.js";
import { isPropertyTypeVertex } from "../../../types/subgraph/vertices.js";
import { typedValues } from "../../../util.js";

/**
 * Returns all `PropertyTypeWithMetadata`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getPropertyTypes = (
  subgraph: Subgraph<boolean>,
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
  subgraph: Subgraph<boolean>,
  propertyTypeId: VersionedUrl,
): PropertyTypeWithMetadata | undefined => {
  const [baseUrl, version] = [
    extractBaseUrl(propertyTypeId),
    extractVersion(propertyTypeId),
  ];
  const vertex = subgraph.vertices[baseUrl]?.[version];

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
  subgraph: Subgraph<boolean>,
  vertexId: OntologyTypeVertexId,
): PropertyTypeWithMetadata | undefined => {
  const vertex = subgraph.vertices[vertexId.baseId]?.[vertexId.revisionId];

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
  subgraph: Subgraph<boolean>,
  baseUrl: BaseUrl,
): PropertyTypeWithMetadata[] => {
  const versionObject = subgraph.vertices[baseUrl];

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
