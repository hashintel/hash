import {
  BaseUri,
  extractBaseUri,
  extractVersion,
  VersionedUri,
} from "@blockprotocol/type-system-node";
import { DataTypeWithMetadata, Subgraph } from "../types";
import { isDataTypeVertex } from "../vertex";

/**
 * Returns all `DataTypeWithMetadata`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getDataTypes = (subgraph: Subgraph): DataTypeWithMetadata[] => {
  return Object.values(
    Object.values(subgraph.vertices).flatMap((versionObject) =>
      Object.values(versionObject)
        .filter(isDataTypeVertex)
        .map((vertex) => vertex.inner),
    ),
  );
};

/**
 * Gets a `DataTypeWithMetadata` by its `VersionedUri` from within the vertices of the subgraph. Returns `undefined` if
 * the data type couldn't be found.
 *
 * @param subgraph
 * @param dataTypeId
 * @throws if the vertex isn't a `DataTypeVertex`
 */
export const getDataType = (
  subgraph: Subgraph,
  dataTypeId: VersionedUri,
): DataTypeWithMetadata | undefined => {
  const [baseUri, version] = [
    extractBaseUri(dataTypeId),
    extractVersion(dataTypeId),
  ];
  const vertex = subgraph.vertices[baseUri]?.[version];

  if (!vertex) {
    return undefined;
  }

  if (!isDataTypeVertex(vertex)) {
    throw new Error(`expected data type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Returns all `DataTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUri`
 *
 * @param subgraph
 * @param baseUri
 */
export const getDataTypesByBaseUri = (
  subgraph: Subgraph,
  baseUri: BaseUri,
): DataTypeWithMetadata[] => {
  const versionObject = subgraph.vertices[baseUri];

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
