import {
  BaseUrl,
  extractBaseUrl,
  extractVersion,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import { DataTypeWithMetadata } from "../../../types/ontology/data-type.js";
import { OntologyTypeVertexId, Subgraph } from "../../../types/subgraph.js";
import { isDataTypeVertex } from "../../../types/subgraph/vertices.js";
import { typedValues } from "../../../util.js";

/**
 * Returns all `DataTypeWithMetadata`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getDataTypes = (
  subgraph: Subgraph<boolean>,
): DataTypeWithMetadata[] => {
  return typedValues(subgraph.vertices).flatMap((versionObject) =>
    typedValues(versionObject)
      .filter(isDataTypeVertex)
      .map((vertex) => vertex.inner),
  );
};

/**
 * Gets a `DataTypeWithMetadata` by its `VersionedUrl` from within the vertices of the subgraph. Returns `undefined` if
 * the data type couldn't be found.
 *
 * @param subgraph
 * @param dataTypeId
 * @throws if the vertex isn't a `DataTypeVertex`
 */
export const getDataTypeById = (
  subgraph: Subgraph<boolean>,
  dataTypeId: VersionedUrl,
): DataTypeWithMetadata | undefined => {
  const [baseUrl, version] = [
    extractBaseUrl(dataTypeId),
    extractVersion(dataTypeId),
  ];
  const vertex = subgraph.vertices[baseUrl]?.[version];

  if (!vertex) {
    return undefined;
  }

  if (!isDataTypeVertex(vertex)) {
    throw new Error(`expected data type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Gets a `DataTypeWithMetadata` by its `OntologyTypeVertexId` from within the vertices of the subgraph. Returns
 * `undefined` if the data type couldn't be found.
 *
 * @param subgraph
 * @param vertexId
 * @throws if the vertex isn't a `DataTypeVertex`
 */
export const getDataTypeByVertexId = (
  subgraph: Subgraph<boolean>,
  vertexId: OntologyTypeVertexId,
): DataTypeWithMetadata | undefined => {
  const vertex = subgraph.vertices[vertexId.baseId]?.[vertexId.revisionId];

  if (!vertex) {
    return undefined;
  }

  if (!isDataTypeVertex(vertex)) {
    throw new Error(`expected data type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Returns all `DataTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUrl`
 *
 * @param subgraph
 * @param baseUrl
 */
export const getDataTypesByBaseUrl = (
  subgraph: Subgraph<boolean>,
  baseUrl: BaseUrl,
): DataTypeWithMetadata[] => {
  const versionObject = subgraph.vertices[baseUrl];

  if (!versionObject) {
    return [];
  }
  const dataTypeVertices = Object.values(versionObject);

  return dataTypeVertices.map((vertex) => {
    if (!isDataTypeVertex(vertex)) {
      throw new Error(`expected data type vertex but got: ${vertex.kind}`);
    }

    return vertex.inner;
  });
};
