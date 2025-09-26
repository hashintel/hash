import type {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";

import type { Edges } from "./subgraph/edges.js";
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

export type EntityRootType<EntityImpl extends Entity = Entity> = {
  vertexId: EntityVertexId;
  element: EntityImpl;
};

export type SubgraphRootType =
  | DataTypeRootType
  | PropertyTypeRootType
  | EntityTypeRootType
  | EntityRootType;

export type Subgraph<
  RootType extends SubgraphRootType = SubgraphRootType,
  EntityImpl extends Entity = Entity,
> = {
  roots: RootType["vertexId"][];
  vertices: Vertices<EntityImpl>;
  edges: Edges;
  temporalAxes: SubgraphTemporalAxes;
};
