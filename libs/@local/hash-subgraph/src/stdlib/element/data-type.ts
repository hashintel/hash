import {
  BaseUri,
  extractBaseUri,
  extractVersion,
  VersionedUri,
} from "@blockprotocol/type-system";
import { DataTypeWithMetadata } from "@local/hash-subgraph/types/element/ontology";

import { OntologyTypeRecordId } from "../../types/identifier";
import { Subgraph } from "../../types/subgraph";
import { isDataTypeVertex } from "../../types/vertex";

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
export const getDataTypeById = (
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
 * Gets a `DataTypeWithMetadata` by its `OntologyTypeRecordId` from within the vertices of the subgraph. Returns
 * `undefined` if the data type couldn't be found.
 *
 * @param subgraph
 * @param recordId
 * @throws if the vertex isn't a `DataTypeVertex`
 */
export const getDataTypeByEditionId = (
  subgraph: Subgraph,
  recordId: OntologyTypeRecordId,
): DataTypeWithMetadata | undefined => {
  const vertex = subgraph.vertices[recordId.baseUri]?.[recordId.version];

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
