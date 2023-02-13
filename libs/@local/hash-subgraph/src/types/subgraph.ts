import {
  GraphResolveDepths,
  TimeProjection,
  UnresolvedTimeProjection,
} from "@local/hash-graph-client";

import { Edges } from "./edge";
import {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "./element";
import {
  EntityVertexId,
  OntologyTypeVertexId,
  Vertices,
} from "./subgraph/vertices";

export * from "./subgraph/vertices";

/** @todo-0.3 - remove this */
export {
  type TimeProjection as ResolvedTimeProjection,
  type UnresolvedTimeProjection as TimeProjection,
} from "@local/hash-graph-client";

export type SubgraphRootTypes = {
  dataType: {
    vertexId: OntologyTypeVertexId;
    element: DataTypeWithMetadata;
  };
  propertyType: {
    vertexId: OntologyTypeVertexId;
    element: PropertyTypeWithMetadata;
  };
  entityType: {
    vertexId: OntologyTypeVertexId;
    element: EntityTypeWithMetadata;
  };
  entity: {
    vertexId: EntityVertexId;
    element: Entity;
  };
};

export type SubgraphRootType = SubgraphRootTypes[keyof SubgraphRootTypes];

export type Subgraph<RootType extends SubgraphRootType = SubgraphRootType> = {
  roots: RootType["vertexId"][];
  vertices: Vertices;
  edges: Edges;
  depths: GraphResolveDepths;
  timeProjection: UnresolvedTimeProjection;
  resolvedTimeProjection: TimeProjection;
};
