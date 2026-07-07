import { isEntityVertex } from "../../types/subgraph/vertices.js";
import { typedValues } from "../../util/typed-entries.js";

import type { EntityRevisionId } from "../../types/entity.js";
import type {
  EntityVertex,
  KnowledgeGraphVertex,
  Subgraph,
  SubgraphRootType,
  Vertex,
} from "../../types/subgraph.js";
import type { Entity } from "@blockprotocol/type-system";

/**
 * Returns all {@link Vertex}es within the vertices of the given {@link Subgraph}, across every base ID and revision.
 *
 * To get only the {@link Entity} revisions, filter the result with {@link isEntityVertex}, or use
 * {@link getLatestEntityVertices} to get the latest revision of each entity.
 *
 * @param subgraph
 */
export const getVertices = <
  RootType extends SubgraphRootType,
  EntityImpl extends Entity,
>(
  subgraph: Subgraph<RootType, EntityImpl>,
): Vertex<EntityImpl>[] =>
  typedValues(subgraph.vertices).flatMap((revisions) => typedValues(revisions));

/**
 * Returns the latest revision of each {@link Entity} within the vertices of the given {@link Subgraph}, as
 * {@link EntityVertex}es.
 *
 * Ontology vertices (data types, property types, entity types) are excluded. To access the {@link Entity} itself, read
 * the `inner` property of each returned {@link EntityVertex}.
 *
 * @param subgraph
 */
export const getLatestEntityVertices = <
  RootType extends SubgraphRootType,
  EntityImpl extends Entity,
>(
  subgraph: Subgraph<RootType, EntityImpl>,
): EntityVertex<EntityImpl>[] =>
  typedValues(subgraph.vertices).flatMap((revisions) => {
    const revisionVersions = Object.keys(
      revisions,
    ).sort() as EntityRevisionId[];

    const lastIndex = revisionVersions.length - 1;
    const vertex = (
      revisions as Record<EntityRevisionId, KnowledgeGraphVertex<EntityImpl>>
    )[revisionVersions[lastIndex]!]!;

    return isEntityVertex(vertex) ? [vertex] : [];
  });
