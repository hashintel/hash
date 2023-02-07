import {
  BaseUri,
  extractBaseUri,
  extractVersion,
  VersionedUri,
} from "@blockprotocol/type-system";

import { PropertyTypeWithMetadata } from "../../types/element";
import { OntologyTypeEditionId } from "../../types/identifier";
import { Subgraph } from "../../types/subgraph";
import { isPropertyTypeVertex } from "../../types/vertex";

/**
 * Returns all `PropertyTypeWithMetadata`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getPropertyTypes = (
  subgraph: Subgraph,
): PropertyTypeWithMetadata[] => {
  return Object.values(
    Object.values(subgraph.vertices).flatMap((versionObject) =>
      Object.values(versionObject)
        .filter(isPropertyTypeVertex)
        .map((vertex) => vertex.inner),
    ),
  );
};

/**
 * Gets a `PropertyTypeWithMetadata` by its `VersionedUri` from within the vertices of the subgraph. Returns `undefined`
 * if the property type couldn't be found.
 *
 * @param subgraph
 * @param propertyTypeId
 * @throws if the vertex isn't a `PropertyTypeVertex`
 */
export const getPropertyTypeById = (
  subgraph: Subgraph,
  propertyTypeId: VersionedUri,
): PropertyTypeWithMetadata | undefined => {
  const [baseUri, version] = [
    extractBaseUri(propertyTypeId),
    extractVersion(propertyTypeId),
  ];
  const vertex = subgraph.vertices[baseUri]?.[version];

  if (!vertex) {
    return undefined;
  }

  if (!isPropertyTypeVertex(vertex)) {
    throw new Error(`expected property type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Gets a `PropertyTypeWithMetadata` by its `OntologyTypeEditionId` from within the vertices of the subgraph. Returns
 * `undefined` if the property type couldn't be found.
 *
 * @param subgraph
 * @param editionId
 * @throws if the vertex isn't a `PropertyTypeVertex`
 */
export const getPropertyTypeByEditionId = (
  subgraph: Subgraph,
  editionId: OntologyTypeEditionId,
): PropertyTypeWithMetadata | undefined => {
  const vertex = subgraph.vertices[editionId.baseId]?.[editionId.version];

  if (!vertex) {
    return undefined;
  }

  if (!isPropertyTypeVertex(vertex)) {
    throw new Error(`expected property type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Returns all `PropertyTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUri`
 *
 * @param subgraph
 * @param baseUri
 */
export const getPropertyTypesByBaseUri = (
  subgraph: Subgraph,
  baseUri: BaseUri,
): PropertyTypeWithMetadata[] => {
  const versionObject = subgraph.vertices[baseUri];

  if (!versionObject) {
    return [];
  }
  const propertyTypeVertices = Object.values(versionObject);

  return propertyTypeVertices.map((vertex) => {
    if (!isPropertyTypeVertex(vertex)) {
      throw new Error(`expected property type vertex but got: ${vertex.kind}`);
    }

    return vertex.inner;
  });
};
