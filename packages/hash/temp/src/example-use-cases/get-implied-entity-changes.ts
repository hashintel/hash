import {
  EntityAndTimestamp,
  EntityId,
  KnowledgeGraphOutwardEdge,
  Subgraph,
} from "@hashintel/subgraph/src/types";
import { getEarliestEditionOfEntity } from "./earliest-entity";
import { getLatestEditionOfEntity } from "./latest-entity";

// depth for changes to the link entity would be 1 and for changes to the endpoint entity it'd be 2
export const getImpliedEntityChanges = (
  subgraph: Subgraph,
  entityId: EntityId,
  depth: number,
  startBound?: string,
  endBound?: string,
): Date[] => {
  if (depth < 0) {
    return [];
  }
  // First the easy part, get all the direct changes to the entity (new versions of the entity)
  const entityEditions = subgraph.vertices[entityId];

  const [startTimeBound, endTimeBound] = [
    startBound ??
      getEarliestEditionOfEntity(subgraph, entityId).metadata.identifier
        .version,
    /** @todo - shouldn't use `version` here we should use `endTime` */
    endBound ??
      getLatestEditionOfEntity(subgraph, entityId).metadata.identifier.version,
  ];

  if (!entityEditions) {
    throw new Error(
      `couldn't find any editions for entity with id ${entityId}`,
    );
  }

  const entityVersions = Object.keys(entityEditions)
    // We don't care about versions made before the start time bound
    .filter(
      (entityVersion) => entityVersion >= startTimeBound,
      /** @todo - we want to check endTime of the entity */
      // &&
      //   entity.endTime <= endTimeBound
    )
    .map((entityVersion) => new Date(entityVersion));

  // Now recursively get the changes to the edges
  const entityEdges = subgraph.edges[entityId];

  if (!entityEdges) {
    return entityVersions;
  }

  return [
    ...entityVersions,
    ...Object.entries(entityEdges)
      // We don't care about edges made after the bound
      .filter(([timestamp, _]) => timestamp <= endTimeBound)
      .flatMap(([_, outwardEdges]) =>
        /** @todo - tsc seems broken without this, claiming the expression isn't callable...
         *    but eslint claims this is unnecessary... */
        (outwardEdges as unknown as KnowledgeGraphOutwardEdge[])
          .filter(
            (outwardEdge) =>
              // We're not interested in changes to edges related to the ontology as these will be accompanied by changes to
              // the properties blob
              outwardEdge.kind === "HAS_LINK" ||
              outwardEdge.kind === "HAS_ENDPOINT",
          )
          .flatMap((outwardEdge) =>
            getImpliedEntityChanges(
              subgraph,
              /** @todo - TypeScript fails to recognise the filter above constrains this */
              (outwardEdge.endpoint as EntityAndTimestamp).entityId,
              depth,
              startTimeBound,
              endTimeBound,
            ),
          ),
      ),
  ];
};
