import { Subgraph } from "../../types/subgraph";
import {
  EntityEditionId,
  EntityId,
  isEntityEditionId,
} from "../../types/identifier";
import { isEntityVertex } from "../../types/vertex";
import { Entity } from "../../types/element";

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
 * Gets an `Entity` by its `EntityEditionId` from within the vertices of the subgraph. Returns `undefined`
 * if the entity couldn't be found.
 *
 * @param subgraph
 * @param entityEditionId
 * @throws if the vertex isn't an `EntityVertex`
 */
export const getEntityByEditionId = (
  subgraph: Subgraph,
  entityEditionId: EntityEditionId,
): Entity | undefined => {
  const [entityId, version] = [entityEditionId.baseId, entityEditionId.version];
  const vertex = subgraph.vertices[entityId]?.[version];

  if (!vertex) {
    return undefined;
  }

  return vertex.inner;
};

/**
 * Returns all `Entity`s within the vertices of the subgraph that match a given `EntityId`
 *
 * @param subgraph
 * @param entityId
 */
export const getEntityEditionsByEntityId = (
  subgraph: Subgraph,
  entityId: EntityId,
): Entity[] => {
  const versionObject = subgraph.vertices[entityId];

  if (!versionObject) {
    return [];
  }
  const entityVertices = Object.values(versionObject);

  return entityVertices.map((vertex) => {
    return vertex.inner;
  });
};

/**
 * Gets an `Entity` by its `EntityId` whose lifespan overlaps a given `Date` moment
 *
 * @param subgraph
 * @param entityId
 * @param {Date | string} timestamp A `Date` or an ISO-formatted datetime string of the moment to search for
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

  for (const [potentialEntityVersion, vertex] of Object.entries(
    entityEditions,
  )) {
    if (
      timestampString <= potentialEntityVersion
      /**
       *  @todo - we need to know the endTime of the entity
       *    https://app.asana.com/0/1201095311341924/1203331904553375/f
       */
      // &&
      // (entity.metadata.endTime == null ||
      //   entity.metadata.endTime > timestamp)
    ) {
      return vertex.inner;
    }
  }

  return undefined;
};

/**
 * Returns all root `Entity` vertices of the subgraph
 *
 * @param subgraph
 * @throws if the roots aren't all `EntityEditionId`s
 * @throws if the subgraph is malformed and there isn't a vertex associated with the root ID
 */
export const getRootsAsEntities = (subgraph: Subgraph): Entity[] => {
  return subgraph.roots.map((rootEditionId) => {
    if (!isEntityEditionId(rootEditionId)) {
      throw new Error(
        `expected roots to be \`EntityEditionId\`s but found:\n${JSON.stringify(
          rootEditionId,
        )}`,
      );
    }
    const rootVertex =
      subgraph.vertices[rootEditionId.baseId]?.[rootEditionId.version];

    if (!rootVertex) {
      throw new Error(
        `looked in vertex set but failed to find root: ${JSON.stringify(
          rootEditionId,
        )}`,
      );
    }

    return rootVertex.inner;
  });
};
