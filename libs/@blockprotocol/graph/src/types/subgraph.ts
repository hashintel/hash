import type { Entity } from "./entity.js";
import type { DataTypeWithMetadata } from "./ontology/data-type.js";
import type { EntityTypeWithMetadata } from "./ontology/entity-type.js";
import type { PropertyTypeWithMetadata } from "./ontology/property-type.js";
import type { Edges } from "./subgraph/edges.js";
import type { GraphResolveDepths } from "./subgraph/graph-resolve-depths.js";
import type { SubgraphTemporalAxes } from "./subgraph/temporal-axes.js";
import type {
  EntityVertexId,
  OntologyTypeVertexId,
  Vertices,
} from "./subgraph/vertices.js";

export * from "./ontology.js";
export * from "./subgraph/edges.js";
export * from "./subgraph/element-mappings.js";
export * from "./subgraph/graph-resolve-depths.js";
export * from "./subgraph/temporal-axes.js";
export * from "./subgraph/vertices.js";

export interface DataTypeRootType {
  vertexId: OntologyTypeVertexId;
  element: DataTypeWithMetadata;
}

export interface PropertyTypeRootType {
  vertexId: OntologyTypeVertexId;
  element: PropertyTypeWithMetadata;
}

export interface EntityTypeRootType {
  vertexId: OntologyTypeVertexId;
  element: EntityTypeWithMetadata;
}

export interface EntityRootType {
  vertexId: EntityVertexId;
  element: Entity;
}

export type SubgraphRootType =
  | DataTypeRootType
  | PropertyTypeRootType
  | EntityTypeRootType
  | EntityRootType;

export interface Subgraph<
  RootType extends SubgraphRootType = SubgraphRootType,
> {
  roots: RootType["vertexId"][];
  vertices: Vertices;
  edges: Edges;
  depths: GraphResolveDepths;
  temporalAxes: SubgraphTemporalAxes;
}
