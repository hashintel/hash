import {
  type EntityRootType,
  isEntityVertex,
  type KnowledgeGraphVertex,
  type Subgraph,
  type SubgraphRootType,
  type Vertices,
} from "@blockprotocol/graph";
import type { TypeIdsAndPropertiesForEntity } from "@blockprotocol/type-system";
import { isEntityId } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  KnowledgeGraphVertex as GraphApiKnowledgeGraphVertex,
  Subgraph as GraphApiSubgraph,
  Vertices as GraphApiVertices,
} from "@local/hash-graph-client";

import {
  HashEntity,
  type SerializedKnowledgeGraphVertex,
  type SerializedSubgraph,
  type SerializedVertices,
} from "./entity.js";

const mapKnowledgeGraphVertex = (vertex: GraphApiKnowledgeGraphVertex) => {
  return {
    kind: vertex.kind,
    inner: new HashEntity(vertex.inner),
  } as KnowledgeGraphVertex;
};

export const mapGraphApiVerticesToVertices = (vertices: GraphApiVertices) =>
  Object.fromEntries(
    typedEntries(vertices).map(([baseId, inner]) => [
      baseId,
      isEntityId(baseId)
        ? Object.fromEntries(
            typedEntries(inner).map(([version, vertex]) => [
              version,
              mapKnowledgeGraphVertex(vertex as GraphApiKnowledgeGraphVertex),
            ]),
          )
        : inner,
    ]),
  ) as Vertices;

/**
 * A mapping function that can be used to map the subgraph returned by the Graph API to the HASH `Subgraph` definition.
 *
 */
export const mapGraphApiSubgraphToSubgraph = <
  RootType extends SubgraphRootType,
  PropertyMap extends TypeIdsAndPropertiesForEntity,
>(
  subgraph: GraphApiSubgraph,
): Subgraph<RootType, HashEntity<PropertyMap>> => {
  return {
    ...subgraph,
    vertices: mapGraphApiVerticesToVertices(subgraph.vertices),
  } as Subgraph<RootType, HashEntity<PropertyMap>>;
};

const serializeKnowledgeGraphVertex = (
  vertex: KnowledgeGraphVertex<HashEntity>,
) => {
  return {
    kind: vertex.kind,
    inner: vertex.inner.toJSON(),
  } as SerializedKnowledgeGraphVertex;
};

const deserializeKnowledgeGraphVertex = (
  vertex: SerializedKnowledgeGraphVertex,
): KnowledgeGraphVertex<HashEntity> => {
  return {
    kind: vertex.kind,
    inner: new HashEntity(vertex.inner),
  };
};

export const serializeGraphVertices = (vertices: Vertices<HashEntity>) =>
  Object.fromEntries(
    typedEntries(vertices).map(([baseId, inner]) => [
      baseId,
      Object.fromEntries(
        typedEntries(inner).map(([version, vertex]) => [
          version,
          isEntityVertex(vertex)
            ? serializeKnowledgeGraphVertex(vertex)
            : vertex,
        ]),
      ),
    ]),
  ) as SerializedVertices;

export const deserializeGraphVertices = <
  PropertyMap extends
    TypeIdsAndPropertiesForEntity = TypeIdsAndPropertiesForEntity,
>(
  vertices: SerializedVertices,
): Vertices<HashEntity<PropertyMap>> =>
  Object.fromEntries(
    typedEntries(vertices).map(([baseId, inner]) => [
      baseId,
      Object.fromEntries(
        typedEntries(inner).map(([version, vertex]) => [
          version,
          vertex.kind === "entity"
            ? deserializeKnowledgeGraphVertex(vertex)
            : vertex,
        ]),
      ),
    ]),
  ) as Vertices<HashEntity<PropertyMap>>;

export const serializeSubgraph = (subgraph: Subgraph): SerializedSubgraph => ({
  roots: subgraph.roots,
  vertices: serializeGraphVertices(subgraph.vertices as Vertices<HashEntity>),
  edges: subgraph.edges,
  temporalAxes: subgraph.temporalAxes,
});

export const deserializeSubgraph = <
  RootType extends
    | Exclude<SubgraphRootType, EntityRootType>
    | EntityRootType<HashEntity>,
>(
  subgraph: SerializedSubgraph,
): Subgraph<RootType, HashEntity> => ({
  roots: subgraph.roots as RootType["vertexId"][],
  vertices: deserializeGraphVertices(subgraph.vertices),
  edges: subgraph.edges,
  temporalAxes: subgraph.temporalAxes,
});
