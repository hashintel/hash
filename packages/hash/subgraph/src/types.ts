import {
  Subgraph as GraphApiSubgraph,
  OntologyVertex as GraphApiOntologyVertex,
  KnowledgeGraphVertex as GraphApiKnowledgeGraphVertex,
  PersistedDataType as GraphApiPersistedDataType,
  PersistedPropertyType as GraphApiPersistedPropertyType,
  PersistedEntityType as GraphApiPersistedEntityType,
  PersistedEntity as GraphApiPersistedEntity,
  GraphElementEditionIdentifier as GraphApiGraphElementEditionIdentifier,
} from "@hashintel/hash-graph-client";
import { BaseUri, VersionedUri } from "@blockprotocol/type-system-node";

// ------------------------------ Identifiers ------------------------------

export type EntityEditionId = Exclude<
  GraphApiGraphElementEditionIdentifier,
  string // We want the entity edition id _object_, we don't want the `VersionedUri`
>;

// TODO: these are superfluous
export type EntityId = EntityEditionId["entityIdentifier"];
export type EntityVersion = EntityEditionId["version"];

export type GraphElementEditionId = EntityEditionId | VersionedUri;

// ------------------------------ Subgraph ------------------------------

// TODO: Utoipa can't handle flattens so the type is wrong
// TODO: We'd quite like to use `VersionedUri` in the type but Utoipa can't affirm that

export type Subgraph<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RootType extends GraphElement = GraphElement,
> = Omit<GraphApiSubgraph, "vertices" | "roots"> & {
  roots: GraphElementEditionId[];
  vertices: {
    [_: BaseUri]: {
      [_: number]: OntologyVertex;
    };
  } & {
    [_: EntityId]: {
      [_: EntityVersion]: KnowledgeGraphVertex;
    };
  };
};

// ------------------------------ Vertices ------------------------------

export type DataTypeVertex = Extract<
  GraphApiOntologyVertex,
  { kind: "dataType" }
>;

export type PropertyTypeVertex = Extract<
  GraphApiOntologyVertex,
  { kind: "propertyType" }
>;

export type EntityTypeVertex = Extract<
  GraphApiOntologyVertex,
  { kind: "entityType" }
>;

export type EntityVertex = Extract<
  GraphApiKnowledgeGraphVertex,
  { kind: "entity" }
>;

export type OntologyVertex =
  | DataTypeVertex
  | PropertyTypeVertex
  | EntityTypeVertex;
export type KnowledgeGraphVertex = EntityVertex;

export type Vertex = OntologyVertex | KnowledgeGraphVertex;

// ------------------------------ Elements ------------------------------

export type DataTypeWithMetadata = GraphApiPersistedDataType;
export type PropertyTypeWithMetadata = GraphApiPersistedPropertyType;
export type EntityTypeWithMetadata = GraphApiPersistedEntityType;
export type Entity = GraphApiPersistedEntity;

export type GraphElement =
  | DataTypeWithMetadata
  | PropertyTypeWithMetadata
  | EntityTypeWithMetadata
  | Entity;
