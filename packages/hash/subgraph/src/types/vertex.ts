import { BaseUri } from "@blockprotocol/type-system-node";
import {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "./element";
import { EntityId, EntityVersion } from "./identifier";

// -------------------------------- Vertex Variants --------------------------------

export type DataTypeVertex = { kind: "dataType"; inner: DataTypeWithMetadata };

export type PropertyTypeVertex = {
  kind: "propertyType";
  inner: PropertyTypeWithMetadata;
};

export type EntityTypeVertex = {
  kind: "entityType";
  inner: EntityTypeWithMetadata;
};

export type EntityVertex = { kind: "entity"; inner: Entity };

export type OntologyVertex =
  | DataTypeVertex
  | PropertyTypeVertex
  | EntityTypeVertex;

export type KnowledgeGraphVertex = EntityVertex;

export type Vertex = OntologyVertex | KnowledgeGraphVertex;

// -------------------------------- The `Vertices` type --------------------------------

export type Vertices = {
  [_: BaseUri]: {
    [_: number]: OntologyVertex;
  };
} & {
  [_: EntityId]: {
    [_: EntityVersion]: KnowledgeGraphVertex;
  };
};
