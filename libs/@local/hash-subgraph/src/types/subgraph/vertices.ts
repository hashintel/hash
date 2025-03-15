import type {
  DataTypeVertex as DataTypeVertexBp,
  EntityRevisionId,
  EntityTypeVertex as EntityTypeVertexBp,
  EntityVertexId as EntityVertexIdBp,
  GraphElementVertexId as GraphElementVertexIdBp,
  OntologyTypeRevisionId,
  OntologyTypeVertexId as OntologyTypeVertexIdBp,
  OntologyVertex as OntologyVertexBp,
  OntologyVertices as OntologyVerticesBp,
  PropertyTypeVertex as PropertyTypeVertexBp,
  VertexId as VertexIdBp,
} from "@blockprotocol/graph";
import {
  isEntityVertexId as isEntityVertexIdBp,
  isOntologyTypeVertexId as isOntologyTypeVertexIdBp,
} from "@blockprotocol/graph";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  EntityId,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import type { Entity, SerializedEntity } from "@local/hash-graph-sdk/entity";
import type { EntityProperties } from "@local/hash-graph-types/entity";

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

export type EntityVertex<
  Properties extends EntityProperties = EntityProperties,
> = {
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
