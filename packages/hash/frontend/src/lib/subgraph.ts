import {
  Vertex as VertexGql,
  DataTypeVertex,
  PropertyTypeVertex,
  LinkTypeVertex,
  EntityTypeVertex,
  EntityVertex as EntityVertexGql,
  LinkVertex,
  PersistedDataType,
  PersistedPropertyType,
  PersistedLinkType,
  PersistedEntityType,
} from "@hashintel/hash-shared/graphql/types";
import { BaseUri } from "@blockprotocol/type-system-web";

import { Subgraph as SubgraphGql } from "../graphql/apiTypes.gen";
import { Entity } from "../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";

// ------------------- Temporary patches while links are fixed -------------------
/** @todo - remove this when links are fixed inside subgraphs - https://app.asana.com/0/0/1203214689883095/f */
export type EntityVertex = Omit<EntityVertexGql, "inner"> & {
  inner: Entity;
};

export type Vertex = Exclude<VertexGql, { kind: "entity" }> | EntityVertex;

export type Subgraph = Omit<SubgraphGql, "vertices"> & {
  vertices: Record<string, Vertex>;
};

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
 * @todo - use `VersionedUri` for the params in here once the type-system package is unified and we no-longer need to
 *   gate on init:
 *   https://app.asana.com/0/1201095311341924/1202923896339225/f
 */

// ------------------- Get methods to encapsulate lookups and error checking -------------------

/**
 * Gets a `PersistedDataType` by its `VersionedUri` from within the vertices of the subgraph. Returns `undefined` if
 * the data type couldn't be found.
 *
 * @param subgraph
 * @param dataTypeId
 * @throws if the vertex isn't a `DataTypeVertex`
 */
export const getPersistedDataType = (
  subgraph: Subgraph,
  dataTypeId: string,
): PersistedDataType | undefined => {
  const vertex = subgraph.vertices[dataTypeId];

  if (!vertex) {
    return undefined;
  }

  if (!isDataTypeVertex(vertex)) {
    throw new Error(`expected data type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Gets a `PersistedPropertyType` by its `VersionedUri` from within the vertices of the subgraph. Returns `undefined` if
 * the property type couldn't be found.
 *
 * @param subgraph
 * @param propertyTypeId
 * @throws if the vertex isn't a `PropertyTypeVertex`
 */
export const getPersistedPropertyType = (
  subgraph: Subgraph,
  propertyTypeId: string,
): PersistedPropertyType | undefined => {
  const vertex = subgraph.vertices[propertyTypeId];

  if (!vertex) {
    return undefined;
  }

  if (!isPropertyTypeVertex(vertex)) {
    throw new Error(`expected property type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Gets a `PersistedLinkType` by its `VersionedUri` from within the vertices of the subgraph. Returns `undefined` if
 * the data type couldn't be found.
 *
 * @param subgraph
 * @param linkTypeId
 * @throws if the vertex isn't a `LinkTypeVertex`
 */
export const getPersistedLinkType = (
  subgraph: Subgraph,
  linkTypeId: string,
): PersistedLinkType | undefined => {
  const vertex = subgraph.vertices[linkTypeId];

  if (!vertex) {
    return undefined;
  }

  if (!isLinkTypeVertex(vertex)) {
    throw new Error(`expected link type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Gets a `PersistedEntityType` by its `VersionedUri` from within the vertices of the subgraph. Returns `undefined` if
 * the entity type couldn't be found.
 *
 * @param subgraph
 * @param entityTypeId
 * @throws if the vertex isn't an `EntityTypeVertex`
 */
export const getPersistedEntityType = (
  subgraph: Subgraph,
  entityTypeId: string,
): PersistedEntityType | undefined => {
  const vertex = subgraph.vertices[entityTypeId];

  if (!vertex) {
    return undefined;
  }

  if (!isEntityTypeVertex(vertex)) {
    throw new Error(`expected entity type vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Gets an `Entity` by its `entityId` from within the vertices of the subgraph. Returns `undefined` if
 * the entity couldn't be found.
 *
 * @param subgraph
 * @param entityId
 * @throws if the vertex isn't an `EntityVertex`
 *
 * @todo - version is required to identify a specific instance of an entity
 *   https://app.asana.com/0/1202805690238892/1203214689883091/f
 */
export const getEntity = (
  subgraph: Subgraph,
  entityId: string,
): Entity | undefined => {
  const vertex = subgraph.vertices[entityId];

  if (!vertex) {
    return undefined;
  }

  if (!isEntityVertex(vertex)) {
    throw new Error(`expected entity vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Gets an `Entity` by its `entityId` from within the vertices of the subgraph. Throws an error if
 * the entity couldn't be found.
 *
 * @param params.subgraph
 * @param params.entityId
 * @throws if the vertex isn't an `EntityVertex`
 * @throws if a vertex with `entityId` doesn't exist
 *
 * @todo - version is required to identify a specific instance of an entity
 *   https://app.asana.com/0/1202805690238892/1203214689883091/f
 */
export const mustGetEntity = (params: {
  subgraph: Subgraph;
  entityId: string;
}): Entity => {
  const { entityId, subgraph } = params;

  const entity = getEntity(subgraph, entityId);

  if (!entity) {
    throw new Error(`Vertex with entityId "${entityId}" does not exist.`);
  }

  return entity;
};

/**
 * Gets the outgoing links of an entity.
 *
 * @param params.subgraph
 * @param params.entityId - the entity id of the source entity.
 * @param params.linkTypeId (optional) - the id of the link type
 *
 * @todo - version is required to identify a specific instance of an entity
 *   https://app.asana.com/0/1202805690238892/1203214689883091/f
 */
export const getOutgoingLinksOfEntity = (params: {
  entityId: string;
  subgraph: Subgraph;
  linkTypeId?: string;
}): LinkVertex[] => {
  const { entityId, subgraph, linkTypeId } = params;

  const outgoingLinks = subgraph.edges[entityId]!.filter(
    ({ edgeKind }) => edgeKind === "HAS_LINK",
  ).map(({ destination }) => subgraph.vertices[destination] as LinkVertex);

  return linkTypeId
    ? outgoingLinks.filter(({ inner }) => inner.inner.linkTypeId === linkTypeId)
    : outgoingLinks;
};

/**
 * Gets the incoming links of an entity.
 *
 * @param params.subgraph
 * @param params.entityId - the entity id of the source entity.
 * @param params.linkTypeId (optional) - the id of the link type
 *
 * @todo - version is required to identify a specific instance of an entity
 *   https://app.asana.com/0/1202805690238892/1203214689883091/f
 */
export const getIncomingLinksOfEntity = (params: {
  entityId: string;
  subgraph: Subgraph;
  linkTypeId?: string;
}): LinkVertex[] => {
  const { entityId, subgraph, linkTypeId } = params;

  /** @todo: return the incoming links of an entity in a more efficient representation */
  const incomingLinks = Object.entries(subgraph.edges)
    .filter(([_, outwardEdges]) =>
      outwardEdges.some(
        ({ edgeKind, destination }) =>
          edgeKind === "HAS_DESTINATION" && destination === entityId,
      ),
    )
    .map(([source]) => subgraph.vertices[source] as LinkVertex);

  return linkTypeId
    ? incomingLinks.filter(({ inner }) => inner.inner.linkTypeId === linkTypeId)
    : incomingLinks;
};

/** @todo - getPersistedEntity and getPersistedLink - https://app.asana.com/0/0/1203157172269853/f */

/**
 * Returns all root `Entity` vertices of the subgraph
 *
 * @param subgraph
 * @throws if the roots aren't all `Entity`
 */
export const getRootsAsEntities = (subgraph: Subgraph): Entity[] => {
  return subgraph.roots.map((root) => {
    const rootVertex = subgraph.vertices[root];
    if (!rootVertex) {
      throw new Error(`looked in vertex set but failed to find root: ${root}`);
    }

    if (!isEntityVertex(rootVertex)) {
      throw new Error(
        `expected vertex to be of kind entity but was: ${rootVertex.kind}`,
      );
    }

    return rootVertex.inner;
  });
};

/**
 * Returns all `PersistedDataType`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getPersistedDataTypes = (
  subgraph: Subgraph,
): PersistedDataType[] => {
  return Object.values(subgraph.vertices)
    .filter(isDataTypeVertex)
    .map((vertex) => vertex.inner);
};

/**
 * Returns all `PersistedPropertyType`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getPersistedPropertyTypes = (
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
export const getPersistedLinkTypes = (
  subgraph: Subgraph,
): PersistedLinkType[] => {
  return Object.values(subgraph.vertices)
    .filter(isLinkTypeVertex)
    .map((vertex) => vertex.inner);
};

/**
 * Returns all `PersistedEntityType`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getPersistedEntityTypes = (
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
export const getPersistedLinks = (subgraph: Subgraph) => {
  return Object.values(subgraph.vertices)
    .filter(isLinkVertex)
    .map((vertex) => vertex.inner);
};

/**
 * Returns all `PersistedEntity`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getPersistedEntities = (subgraph: Subgraph) => {
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

// ------------------- Checked Subgraph Objects -------------------

export type RootEntityAndSubgraph = { root: Entity; subgraph: Subgraph };

/**
 * Checks if the `subgraph` is rooted at a single `Entity` and returns a `RootEntityAndSubgraph`
 * @param subgraph
 * @throws if there were more or less than one root
 * @throws if the root wasn't an `EntityVertex`
 */
export const extractEntityRoot = (
  subgraph: Subgraph,
): RootEntityAndSubgraph => {
  if (subgraph.roots.length !== 1) {
    throw new Error(
      `expected subgraph to have a single root but had ${subgraph.roots.length}`,
    );
  }

  return {
    root: getRootsAsEntities(subgraph)[0]!,
    subgraph,
  };
};
