import { GraphResolveDepths } from "@local/hash-graph-client";

import { Edges } from "./edge";
import {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "./element";
import { EntityVertexId, OntologyTypeVertexId } from "./identifier";
import { ResolvedTimeProjection, TimeProjection } from "./time";
import { Vertices } from "./vertex";

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
  timeProjection: TimeProjection;
  resolvedTimeProjection: ResolvedTimeProjection;
};
