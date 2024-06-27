import type { Entity } from "./entity";
import type { DataTypeWithMetadata } from "./ontology/data-type";
import type { EntityTypeWithMetadata } from "./ontology/entity-type";
import type { PropertyTypeWithMetadata } from "./ontology/property-type";
import type { Edges } from "./subgraph/edges";
import type { GraphResolveDepths } from "./subgraph/graph-resolve-depths";
import type { SubgraphTemporalAxes } from "./subgraph/temporal-axes";
import type {
  EntityVertexId,
  OntologyTypeVertexId,
  Vertices,
} from "./subgraph/vertices";

export * from "./ontology";
export * from "./subgraph/edges";
export * from "./subgraph/element-mappings";
export * from "./subgraph/graph-resolve-depths";
export * from "./subgraph/temporal-axes";
export * from "./subgraph/vertices";

export type DataTypeRootType = {
  vertexId: OntologyTypeVertexId;
  element: DataTypeWithMetadata;
};

export type PropertyTypeRootType = {
  vertexId: OntologyTypeVertexId;
  element: PropertyTypeWithMetadata;
};

export type EntityTypeRootType = {
  vertexId: OntologyTypeVertexId;
  element: EntityTypeWithMetadata;
};

export type EntityRootType = {
  vertexId: EntityVertexId;
  element: Entity;
};

export type SubgraphRootType =
  | DataTypeRootType
  | PropertyTypeRootType
  | EntityTypeRootType
  | EntityRootType;

export type Subgraph<RootType extends SubgraphRootType = SubgraphRootType> = {
  roots: RootType["vertexId"][];
  vertices: Vertices;
  edges: Edges;
  depths: GraphResolveDepths;
  temporalAxes: SubgraphTemporalAxes;
};
