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
import { EntityEditionId } from "./identifier";
import { Vertices } from "./vertex";

export type SubgraphRootTypes = {
  dataType: {
    editionId: OntologyTypeEditionId;
    element: DataTypeWithMetadata;
  };
  propertyType: {
    editionId: OntologyTypeEditionId;
    element: PropertyTypeWithMetadata;
  };
  entityType: {
    editionId: OntologyTypeEditionId;
    element: EntityTypeWithMetadata;
  };
  entity: {
    editionId: EntityEditionId;
    element: Entity;
  };
};

export type SubgraphRootType = SubgraphRootTypes[keyof SubgraphRootTypes];

export type Subgraph<RootType extends SubgraphRootType = SubgraphRootType> = {
  roots: RootType["editionId"][];
  vertices: Vertices;
  edges: Edges;
  depths: GraphResolveDepths;
};
