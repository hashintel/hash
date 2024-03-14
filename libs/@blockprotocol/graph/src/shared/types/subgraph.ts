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

export type EntityRootType<Temporal extends boolean> = {
  vertexId: EntityVertexId;
  element: Entity<Temporal>;
};

export type SubgraphRootType<Temporal extends boolean> =
  | DataTypeRootType
  | PropertyTypeRootType
  | EntityTypeRootType
  | EntityRootType<Temporal>;

export type Subgraph<
  Temporal extends boolean,
  RootType extends SubgraphRootType<Temporal> = SubgraphRootType<Temporal>,
> = {
  roots: RootType["vertexId"][];
  vertices: Vertices<Temporal>;
  edges: Edges<Temporal>;
  depths: GraphResolveDepths;
} & (Temporal extends true
  ? { temporalAxes: SubgraphTemporalAxes }
  : { temporalAxes?: never });

export const isTemporalSubgraph = <
  RootType extends SubgraphRootType<boolean> = SubgraphRootType<boolean>,
>(
  subgraph: Subgraph<boolean, RootType>,
): subgraph is Subgraph<true, RootType> => {
  return "temporalAxes" in subgraph && !!subgraph.temporalAxes;
};
