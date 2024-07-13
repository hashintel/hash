import {
  type DataTypeRootType as DataTypeRootTypeBp,
  type EntityTypeRootType as EntityTypeRootTypeBp,
  type PropertyTypeRootType as PropertyTypeRootTypeBp,
} from "@blockprotocol/graph";
import type { Subtype } from "@local/advanced-types/subtype";
import type { Entity, SerializedEntity } from "@local/hash-graph-sdk/entity";
import type { EntityProperties } from "@local/hash-graph-types/entity";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";

import type { Edges } from "./subgraph/edges";
import type { GraphResolveDepths } from "./subgraph/graph-resolve-depths";
import type { SubgraphTemporalAxes } from "./subgraph/temporal-axes";
import type {
  EntityVertexId,
  OntologyTypeVertexId,
  SerializedVertices,
  Vertices,
} from "./subgraph/vertices";

export * from "./subgraph/edges";
export * from "./subgraph/graph-resolve-depths";
export * from "./subgraph/temporal-axes";
export * from "./subgraph/vertices";

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

export type EntityRootType<
  Properties extends EntityProperties = EntityProperties,
> = {
  vertexId: EntityVertexId;
  element: Entity<Properties>;
};

export type SubgraphRootType =
  | DataTypeRootType
  | PropertyTypeRootType
  | EntityTypeRootType
  | EntityRootType;

export type SerializedEntityRootType = {
  vertexId: EntityVertexId;
  element: SerializedEntity;
};

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

export type Subgraph<RootType extends SubgraphRootType = SubgraphRootType> = {
  roots: RootType["vertexId"][];
  vertices: Vertices;
  edges: Edges;
  depths: GraphResolveDepths;
  temporalAxes: SubgraphTemporalAxes;
};
export type SerializedSubgraph<
  RootType extends SerializedSubgraphRootType = SerializedSubgraphRootType,
> = {
  roots: RootType["vertexId"][];
  vertices: SerializedVertices;
  edges: Edges;
  depths: GraphResolveDepths;
  temporalAxes: SubgraphTemporalAxes;
};
