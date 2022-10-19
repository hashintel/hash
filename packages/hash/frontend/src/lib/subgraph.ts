import {
  Vertex,
  DataTypeVertex,
  PropertyTypeVertex,
  LinkTypeVertex,
  EntityTypeVertex,
  EntityVertex,
  LinkVertex,
  PersistedDataType,
  PersistedPropertyType,
  PersistedLinkType,
  PersistedEntityType,
} from "@hashintel/hash-shared/graphql/types";
import { BaseUri } from "@blockprotocol/type-system-web";

import { Subgraph } from "../graphql/apiTypes.gen";

// ------------------- Type Guards to use inside .filters -------------------

export const isDataTypeVertex = (vertex: Vertex): vertex is DataTypeVertex => {
  return vertex.kind === "dataType";
};

export const isPropertyTypeVertex = (
  vertex: Vertex,
): vertex is PropertyTypeVertex => {
  return vertex.kind === "propertyType";
};

export const isLinkTypeVertex = (vertex: Vertex): vertex is LinkTypeVertex => {
  return vertex.kind === "linkType";
};

export const isEntityTypeVertex = (
  vertex: Vertex,
): vertex is EntityTypeVertex => {
  return vertex.kind === "entityType";
};

export const isEntityVertex = (vertex: Vertex): vertex is EntityVertex => {
  return vertex.kind === "entity";
};

export const isLinkVertex = (vertex: Vertex): vertex is LinkVertex => {
  return vertex.kind === "link";
};

/**
 * Returns all `PersistedDataType`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const roots = (subgraph: Subgraph): Vertex[] => {
  return subgraph.roots.map((root) => {
    const rootVertex = subgraph.vertices[root];
    if (!rootVertex) {
      throw new Error(`looked in vertex set but failed to find root: ${root}`);
    }

    return rootVertex;
  });
};

/**
 * Returns all `PersistedDataType`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const persistedDataTypes = (subgraph: Subgraph): PersistedDataType[] => {
  return Object.values(subgraph.vertices)
    .filter(isDataTypeVertex)
    .map((vertex) => vertex.inner);
};

/**
 * Returns all `PersistedPropertyType`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const persistedPropertyTypes = (
  subgraph: Subgraph,
): PersistedPropertyType[] => {
  return Object.values(subgraph.vertices)
    .filter(isPropertyTypeVertex)
    .map((vertex) => vertex.inner);
};

/**
 * Returns all `PersistedLinkType`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const persistedLinkTypes = (subgraph: Subgraph): PersistedLinkType[] => {
  return Object.values(subgraph.vertices)
    .filter(isLinkTypeVertex)
    .map((vertex) => vertex.inner);
};

/**
 * Returns all `PersistedEntityType`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const persistedEntityTypes = (
  subgraph: Subgraph,
): PersistedEntityType[] => {
  return Object.values(subgraph.vertices)
    .filter(isEntityTypeVertex)
    .map((vertex) => vertex.inner);
};

/** @todo - improve the typing of these */

/**
 * Returns all `PersistedLink`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const persistedLinks = (subgraph: Subgraph) => {
  return Object.values(subgraph.vertices)
    .filter(isLinkVertex)
    .map((vertex) => vertex.inner);
};

/**
 * Returns all `PersistedEntity`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const persistedEntities = (subgraph: Subgraph) => {
  return Object.values(subgraph.vertices)
    .filter(isEntityVertex)
    .map((vertex) => vertex.inner);
};

/**
 * Returns all `PersistedDataType`s within the vertices of the subgraph that match a given `BaseUri`
 *
 * @param subgraph
 * @param baseUri
 */
export const getDataTypesByBaseUri = (
  subgraph: Subgraph,
  baseUri: BaseUri,
): PersistedDataType[] => {
  const dataTypeIds = Object.keys(subgraph.vertices).filter(
    (graphElementIdentifier) => graphElementIdentifier.startsWith(baseUri),
  );

  return dataTypeIds.map((dataTypeId) => {
    const vertex = subgraph.vertices[dataTypeId]!;
    if (!isDataTypeVertex(vertex)) {
      throw new Error(`expected data type vertex but got: ${vertex.kind}`);
    }

    return vertex.inner;
  });
};

/**
 * Returns all `PersistedPropertyType`s within the vertices of the subgraph that match a given `BaseUri`
 *
 * @param subgraph
 * @param baseUri
 */
export const getPropertyTypesByBaseUri = (
  subgraph: Subgraph,
  baseUri: BaseUri,
): PersistedPropertyType[] => {
  const propertyTypeIds = Object.keys(subgraph.vertices).filter(
    (graphElementIdentifier) => graphElementIdentifier.startsWith(baseUri),
  );

  return propertyTypeIds.map((propertyTypeId) => {
    const vertex = subgraph.vertices[propertyTypeId]!;
    if (!isPropertyTypeVertex(vertex)) {
      throw new Error(`expected property type vertex but got: ${vertex.kind}`);
    }

    return vertex.inner;
  });
};

/**
 * Returns all `PersistedLinkType`s within the vertices of the subgraph that match a given `BaseUri`
 *
 * @param subgraph
 * @param baseUri
 */
export const getLinkTypesByBaseUri = (
  subgraph: Subgraph,
  baseUri: BaseUri,
): PersistedLinkType[] => {
  const linkTypeIds = Object.keys(subgraph.vertices).filter(
    (graphElementIdentifier) => graphElementIdentifier.startsWith(baseUri),
  );

  return linkTypeIds.map((linkTypeId) => {
    const vertex = subgraph.vertices[linkTypeId]!;
    if (!isLinkTypeVertex(vertex)) {
      throw new Error(`expected link type vertex but got: ${vertex.kind}`);
    }

    return vertex.inner;
  });
};

/**
 * Returns all `PersistedEntityType`s within the vertices of the subgraph that match a given `BaseUri`
 *
 * @param subgraph
 * @param baseUri
 */
export const getEntityTypesByBaseUri = (
  subgraph: Subgraph,
  baseUri: BaseUri,
): PersistedEntityType[] => {
  const entityTypeIds = Object.keys(subgraph.vertices).filter(
    (graphElementIdentifier) => graphElementIdentifier.startsWith(baseUri),
  );

  return entityTypeIds.map((entityTypeId) => {
    const vertex = subgraph.vertices[entityTypeId]!;
    if (!isEntityTypeVertex(vertex)) {
      throw new Error(`expected entity type vertex but got: ${vertex.kind}`);
    }

    return vertex.inner;
  });
};
