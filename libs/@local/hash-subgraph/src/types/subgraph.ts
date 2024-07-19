import type {
  DataTypeRootType as DataTypeRootTypeBp,
  EntityTypeRootType as EntityTypeRootTypeBp,
  PropertyTypeRootType as PropertyTypeRootTypeBp,
} from "@blockprotocol/graph";
import type { Subtype } from "@local/advanced-types/subtype";
import type { Entity, SerializedEntity } from "@local/hash-graph-sdk/entity";
import type { EntityProperties } from "@local/hash-graph-types/entity";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";

import type { Edges } from "./subgraph/edges.js";
import type { GraphResolveDepths } from "./subgraph/graph-resolve-depths.js";
import type { SubgraphTemporalAxes } from "./subgraph/temporal-axes.js";
import type {
  EntityVertexId,
  OntologyTypeVertexId,
  SerializedVertices,
  Vertices,
} from "./subgraph/vertices.js";

export * from "./subgraph/edges.js";
export * from "./subgraph/graph-resolve-depths.js";
export * from "./subgraph/temporal-axes.js";
export * from "./subgraph/vertices.js";

export type DataTypeRootType = Subtype<
  DataTypeRootTypeBp,
  {
    vertexId: OntologyTypeVertexId;
    element: DataTypeWithMetadata;
  }
>;

export type PropertyTypeRootType = Subtype<
  PropertyTypeRootTypeBp,
  {
    vertexId: OntologyTypeVertexId;
    element: PropertyTypeWithMetadata;
  }
>;

export type EntityTypeRootType = Subtype<
  EntityTypeRootTypeBp,
  {
    vertexId: OntologyTypeVertexId;
    element: EntityTypeWithMetadata;
  }
>;

export interface EntityRootType<
  Properties extends EntityProperties = EntityProperties,
> {
  vertexId: EntityVertexId;
  element: Entity<Properties>;
}

export type SubgraphRootType =
  | DataTypeRootType
  | PropertyTypeRootType
  | EntityTypeRootType
  | EntityRootType;

export interface SerializedEntityRootType {
  vertexId: EntityVertexId;
  element: SerializedEntity;
}

export type SerializedSubgraphRootType =
  | DataTypeRootType
  | PropertyTypeRootType
  | EntityTypeRootType
  | SerializedEntityRootType;

/** @todo - Figure out the incompatible vertices/edges is it the `&` instead of `|`? */
// export type Subgraph<
//   RootType extends SubgraphRootType = SubgraphRootType,
//   > = Subtype<{
//   roots: RootType["vertexId"][];
//   vertices: Vertices;
//   edges: Edges;
//   depths: GraphResolveDepths;
//   temporalAxes: SubgraphTemporalAxes
// }, SubgraphBp< RootType>;

export interface Subgraph<RootType extends SubgraphRootType = SubgraphRootType> {
  roots: RootType["vertexId"][];
  vertices: Vertices;
  edges: Edges;
  depths: GraphResolveDepths;
  temporalAxes: SubgraphTemporalAxes;
}
export interface SerializedSubgraph<
  RootType extends SerializedSubgraphRootType = SerializedSubgraphRootType,
> {
  roots: RootType["vertexId"][];
  vertices: SerializedVertices;
  edges: Edges;
  depths: GraphResolveDepths;
  temporalAxes: SubgraphTemporalAxes;
}
