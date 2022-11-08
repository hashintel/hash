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

export type EntityAndTimestamp = { entityId: EntityId; timestamp: string };

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

// ------------------------------ Edges ------------------------------

type OntologyEdgeKind =
  | "INHERITS_FROM"
  | "CONSTRAINS_VALUES_ON"
  | "CONSTRAINS_PROPERTIES_ON"
  | "CONSTRAINS_LINKS_ON"
  | "CONSTRAINS_LINK_DESTINATIONS_ON";
type KnowledgeGraphEdgeKind = "HAS_LINK" | "HAS_ENDPOINT";
type SharedEdgeKind = "IS_OF_TYPE";

type GenericOutwardEdge<K, E> = {
  kind: K;
  reversed: boolean;
  endpoint: E;
};

export type OntologyOutwardEdge =
  | GenericOutwardEdge<OntologyEdgeKind, VersionedUri>
  | GenericOutwardEdge<SharedEdgeKind, EntityEditionId>;
export type KnowledgeGraphOutwardEdge =
  | GenericOutwardEdge<KnowledgeGraphEdgeKind, EntityAndTimestamp>
  | GenericOutwardEdge<SharedEdgeKind, VersionedUri>;

export type OutwardEdge = OntologyOutwardEdge | KnowledgeGraphOutwardEdge;

// ------------------------------ Subgraph ------------------------------

// TODO: Utoipa can't handle flattens so the type is wrong
// TODO: We'd quite like to use `VersionedUri` in the type but Utoipa can't affirm that
// TODO: `edges` is completely buggered
export type Subgraph<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RootType extends GraphElement = GraphElement,
> = Omit<GraphApiSubgraph, "vertices" | "roots" | "edges"> & {
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
  edges: {
    [_: BaseUri]: {
      [_: number]: OntologyOutwardEdge[];
    };
  } & {
    [_: EntityId]: {
      [_: EntityVersion]: KnowledgeGraphOutwardEdge[];
    };
  };
};
