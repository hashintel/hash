import {
  type DataTypeRootType as DataTypeRootTypeBp,
  type EntityTypeRootType as EntityTypeRootTypeBp,
  type PropertyTypeRootType as PropertyTypeRootTypeBp,
} from "@blockprotocol/graph/temporal";
import type { Subtype } from "@local/advanced-types/subtype";
import type { SimpleEntity } from "@local/hash-graph-types/entity";
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

export type EntityRootType = {
  vertexId: EntityVertexId;
  element: SimpleEntity;
};

export type SubgraphRootType =
  | DataTypeRootType
  | PropertyTypeRootType
  | EntityTypeRootType
  | EntityRootType;

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
