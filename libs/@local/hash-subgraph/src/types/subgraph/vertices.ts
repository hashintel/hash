import {
  type DataTypeVertex as DataTypeVertexBp,
  type EntityTypeVertex as EntityTypeVertexBp,
  type EntityVertexId as EntityVertexIdBp,
  type GraphElementVertexId as GraphElementVertexIdBp,
  isEntityVertexId as isEntityVertexIdBp,
  isOntologyTypeVertexId as isOntologyTypeVertexIdBp,
  type OntologyTypeVertexId as OntologyTypeVertexIdBp,
  type OntologyVertex as OntologyVertexBp,
  type OntologyVertices as OntologyVerticesBp,
  type PropertyTypeVertex as PropertyTypeVertexBp,
  type VertexId as VertexIdBp,
} from "@blockprotocol/graph/temporal";
import type { Subtype } from "@local/advanced-types/subtype";
import type { Entity, SerializedEntity } from "@local/hash-graph-sdk/entity";
import type { EntityId, PropertyObject } from "@local/hash-graph-types/entity";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";

import type { EntityRevisionId, OntologyTypeRevisionId } from "../element";

export type DataTypeVertex = Subtype<
  DataTypeVertexBp,
  {
    kind: "dataType";
    inner: DataTypeWithMetadata;
  }
>;

export type PropertyTypeVertex = Subtype<
  PropertyTypeVertexBp,
  {
    kind: "propertyType";
    inner: PropertyTypeWithMetadata;
  }
>;

export type EntityTypeVertex = Subtype<
  EntityTypeVertexBp,
  {
    kind: "entityType";
    inner: EntityTypeWithMetadata;
  }
>;

export type EntityVertex<Properties extends PropertyObject = PropertyObject> = {
  kind: "entity";
  inner: Entity<Properties>;
};
export type SerializedEntityVertex = {
  kind: "entity";
  inner: SerializedEntity;
};

export type OntologyVertex = Subtype<
  OntologyVertexBp,
  DataTypeVertex | PropertyTypeVertex | EntityTypeVertex
>;

export type KnowledgeGraphVertex = EntityVertex;
export type SerializedKnowledgeGraphVertex = SerializedEntityVertex;

export type Vertex = OntologyVertex | KnowledgeGraphVertex;

export const isDataTypeVertex = (vertex: Vertex): vertex is DataTypeVertex =>
  vertex.kind === "dataType";

export const isPropertyTypeVertex = (
  vertex: Vertex,
): vertex is PropertyTypeVertex => vertex.kind === "propertyType";

export const isEntityVertex = (vertex: Vertex): vertex is EntityVertex =>
  vertex.kind === "entity";

export type VertexId<BaseId, RevisionId> = VertexIdBp<BaseId, RevisionId>;
export type EntityVertexId = Subtype<
  EntityVertexIdBp,
  VertexId<EntityId, EntityRevisionId>
>;
export type OntologyTypeVertexId = Subtype<
  OntologyTypeVertexIdBp,
  VertexId<BaseUrl, OntologyTypeRevisionId>
>;
export type GraphElementVertexId = Subtype<
  GraphElementVertexIdBp,
  EntityVertexId | OntologyTypeVertexId
>;

export const isOntologyTypeVertexId = (
  vertexId: unknown,
): vertexId is OntologyTypeVertexId => isOntologyTypeVertexIdBp(vertexId);

export const isEntityVertexId = (
  vertexId: unknown,
): vertexId is EntityVertexId => isEntityVertexIdBp(isEntityVertexIdBp);

export type OntologyVertices = Subtype<
  OntologyVerticesBp,
  {
    [baseUrl: BaseUrl]: {
      [revisionId: OntologyTypeRevisionId]: OntologyVertex;
    };
  }
>;

export type KnowledgeGraphVertices = {
  [entityId: EntityId]: {
    [revisionId: EntityRevisionId]: KnowledgeGraphVertex;
  };
};
export type SerializedKnowledgeGraphVertices = {
  [entityId: EntityId]: {
    [revisionId: EntityRevisionId]: SerializedKnowledgeGraphVertex;
  };
};

export type Vertices = OntologyVertices & KnowledgeGraphVertices;
export type SerializedVertices = OntologyVertices &
  SerializedKnowledgeGraphVertices;
