import { mustBeDefined } from "../../shared/invariant";
import { Entity } from "../../types/element";
import {
  EntityId,
  EntityVertexId,
  isEntityVertexId,
} from "../../types/identifier";
import { Subgraph } from "../../types/subgraph";
import { isEntityVertex } from "../../types/vertex";

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
 * Gets an `Entity` by its `EntityRecordId` from within the vertices of the subgraph. Returns `undefined`
 * if the entity couldn't be found.
 *
 * @param subgraph
 * @param entityRecordId
 * @throws if the vertex isn't an `EntityVertex`
 */
export const getEntityByVertexId = (
  subgraph: Subgraph,
  entityVertexId: EntityVertexId,
): Entity | undefined => {
  const { baseId: entityId, version } = entityVertexId;
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
 * @param {Date | string} timestamp - A `Date` or an ISO-formatted datetime string of the moment to search for
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
    return undefined;
  }

  for (const [potentialEntityVersion, vertex] of Object.entries(
    entityEditions,
  )) {
    if (
      potentialEntityVersion <= timestampString
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
 * @throws if the roots aren't all `EntityRecordId`s
 * @throws if the subgraph is malformed and there isn't a vertex associated with the root ID
 */
export const getRootsAsEntities = (subgraph: Subgraph): Entity[] => {
  return subgraph.roots.map((rootVertexId) => {
    if (!isEntityVertexId(rootVertexId)) {
      throw new Error(
        `expected roots to be \`EntityVertexId\`s but found:\n${JSON.stringify(
          rootVertexId,
        )}`,
      );
    }
    const rootVertex = mustBeDefined(
      subgraph.vertices[rootVertexId.baseId]?.[rootVertexId.version],
      `roots should have corresponding vertices but ${JSON.stringify(
        rootVertexId,
      )} was missing`,
    );

    return rootVertex.inner;
  });
};
