import {
  GraphResolveDepths,
  OntologyTypeEditionId,
} from "@hashintel/hash-graph-client";

import { Edges } from "./edge";
import {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "./element";
import { EntityVertexId } from "./identifier";
import { ResolvedTimeProjection, TimeProjection } from "./time";
import { Vertices } from "./vertex";

export type SubgraphRootTypes = {
  dataType: {
    vertexId: OntologyTypeEditionId;
    element: DataTypeWithMetadata;
  };
  propertyType: {
    vertexId: OntologyTypeEditionId;
    element: PropertyTypeWithMetadata;
  };
  entityType: {
    vertexId: OntologyTypeEditionId;
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
