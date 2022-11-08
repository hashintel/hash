import { EntityEditionId, Entity, Subgraph, EntityId } from "../types";
import { isEntityVertex } from "../vertex";
import { isEntityEditionId } from "../identifier";

/**
 * Returns all `Entity`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getEntities = (subgraph: Subgraph): Entity[] => {
  return Object.values(
    Object.values(subgraph.vertices).flatMap((versionObject) =>
      Object.values(versionObject)
        .filter(isEntityVertex)
        .map((vertex) => vertex.inner),
    ),
  );
};

/**
 * Gets an `EntityWithMetadata` by its `EntityEditionId` from within the vertices of the subgraph. Returns `undefined`
 * if the entity couldn't be found.
 *
 * @param subgraph
 * @param entityEditionId
 * @throws if the vertex isn't a `EntityVertex`
 */
export const getEntity = (
  subgraph: Subgraph,
  entityEditionId: EntityEditionId,
): Entity | undefined => {
  const [entityId, version] = [
    entityEditionId.entityIdentifier,
    entityEditionId.version,
  ];
  const vertex = subgraph.vertices[entityId]?.[version];

  if (!vertex) {
    return undefined;
  }

  if (!isEntityVertex(vertex)) {
    throw new Error(`expected entity vertex but got: ${vertex.kind}`);
  }

  return vertex.inner;
};

/**
 * Returns all `Entity`s within the vertices of the subgraph that match a given `EntityId`
 *
 * @param subgraph
 * @param entityId
 */
export const getEntitiesByEntityId = (
  subgraph: Subgraph,
  entityId: EntityId,
): Entity[] => {
  const versionObject = subgraph.vertices[entityId];

  if (!versionObject) {
    return [];
  }
  const entityVertices = Object.values(versionObject);

  return entityVertices.map((vertex) => {
    if (!isEntityVertex(vertex)) {
      throw new Error(`expected entity vertex but got: ${vertex.kind}`);
    }

    return vertex.inner;
  });
};

/**
 * Gets an `EntityWithMetadata` with `EntityEditionId` whose lifespan overlaps a given `Date`
 *
 * @param subgraph
 * @param entityId
 * @param timestamp
 *
 * @throws if the vertices pointed to by `entityId` aren't `EntityVertex`es
 */
export const getEntityAtTimestamp = (
  subgraph: Subgraph,
  entityId: EntityId,
  timestamp: Date | string,
): Entity | undefined => {
  const timestampString =
    typeof timestamp === "string" ? timestamp : timestamp.toISOString();

  const entityEditions = subgraph.vertices[entityId];
  if (!entityEditions) {
    throw new Error(`no entities found for entityId: ${entityId}`);
  }

  return Object.entries(entityEditions).find(
    ([potentialEntityVersion, vertex]) => {
      if (!isEntityVertex(vertex)) {
        throw new Error(`expected entity vertex but got: ${vertex.kind}`);
      }

      return (
        timestampString <= potentialEntityVersion
        /** @todo - we need to know the endTime of the entity */
        // &&
        // (entity.metadata.endTime == null ||
        //   entity.metadata.endTime > timestamp)
      );
    },
  )?.[1] as Entity | undefined;
};

/**
 * Returns all root `Entity` vertices of the subgraph
 *
 * @param subgraph
 * @throws if the roots aren't all `Entity`
 */
export const getRootsAsEntities = (subgraph: Subgraph): Entity[] => {
  return subgraph.roots.map((rootEditionId) => {
    if (!isEntityEditionId(rootEditionId)) {
      throw new Error(
        `expected root IDs to refer to entity editions, but received something else`,
      );
    }

    const rootVertex =
      subgraph.vertices[rootEditionId.entityIdentifier]?.[
        rootEditionId.version
      ];

    if (!rootVertex) {
      throw new Error(
        `looked in vertex set but failed to find root: ${JSON.stringify(
          rootEditionId,
        )}`,
      );
    }

    if (!isEntityVertex(rootVertex)) {
      throw new Error(
        `expected vertex to be of kind entity but was: ${rootVertex.kind}`,
      );
    }

    return rootVertex.inner;
  });
};
