import {
  type DataTypeVertex as DataTypeVertexBp,
  type EntityTypeVertex as EntityTypeVertexBp,
  type EntityVertex as EntityVertexBp,
  type EntityVertexId as EntityVertexIdBp,
  type GraphElementVertexId as GraphElementVertexIdBp,
  type KnowledgeGraphVertex as KnowledgeGraphVertexBp,
  type KnowledgeGraphVertices as KnowledgeGraphVerticesBp,
  type OntologyTypeVertexId as OntologyTypeVertexIdBp,
  type OntologyVertex as OntologyVertexBp,
  type OntologyVertices as OntologyVerticesBp,
  type PropertyTypeVertex as PropertyTypeVertexBp,
  type Vertex as VertexBp,
  type VertexId as VertexIdBp,
  type Vertices as VerticesBp,
  isDataTypeVertex as isDataTypeVertexBp,
  isEntityTypeVertex as isEntityTypeVertexBp,
  isEntityVertex as isEntityVertexBp,
  isEntityVertexId as isEntityVertexIdBp,
  isOntologyTypeVertexId as isOntologyTypeVertexIdBp,
  isPropertyTypeVertex as isPropertyTypeVertexBp,
} from "@blockprotocol/graph";
import { BaseUri } from "@blockprotocol/type-system/slim";
import { Subtype } from "@local/advanced-types/subtype";

import { EntityId } from "../../branded";
import {
  Entity,
  EntityPropertiesObject,
  EntityPropertyValue,
  EntityRevisionId,
} from "../knowledge";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  OntologyTypeRevisionId,
  PropertyTypeWithMetadata,
} from "../ontology";

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
  Properties extends EntityPropertiesObject | null = Record<
    BaseUri,
    EntityPropertyValue
  >,
> = Subtype<
  EntityVertexBp<true, Properties>,
  { kind: "entity"; inner: Entity<Properties> }
>;

export type OntologyVertex = Subtype<
  OntologyVertexBp,
  DataTypeVertex | PropertyTypeVertex | EntityTypeVertex
>;

export type KnowledgeGraphVertex<
  Properties extends EntityPropertiesObject | null = Record<
    BaseUri,
    EntityPropertyValue
  >,
> = Subtype<KnowledgeGraphVertexBp<true, Properties>, EntityVertex<Properties>>;

export type Vertex<
  Properties extends EntityPropertiesObject | null = Record<
    BaseUri,
    EntityPropertyValue
  >,
> = Subtype<
  VertexBp<true, Properties>,
  OntologyVertex | KnowledgeGraphVertex<Properties>
>;

export const isDataTypeVertex = (vertex: Vertex): vertex is DataTypeVertex =>
  isDataTypeVertexBp(vertex);

export const isPropertyTypeVertex = (
  vertex: Vertex,
): vertex is PropertyTypeVertex => isPropertyTypeVertexBp(vertex);

export const isEntityTypeVertex = (
  vertex: Vertex,
): vertex is EntityTypeVertex => isEntityTypeVertexBp(vertex);

export const isEntityVertex = (vertex: Vertex): vertex is EntityVertex =>
  isEntityVertexBp(vertex);

export type VertexId<BaseId, RevisionId> = VertexIdBp<BaseId, RevisionId>;
export type EntityVertexId = Subtype<
  EntityVertexIdBp,
  VertexId<EntityId, EntityRevisionId>
>;
export type OntologyTypeVertexId = Subtype<
  OntologyTypeVertexIdBp,
  VertexId<BaseUri, OntologyTypeRevisionId>
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
  Record<BaseUri, Record<OntologyTypeRevisionId, OntologyVertex>>
>;

export type KnowledgeGraphVertices = Subtype<
  KnowledgeGraphVerticesBp<true>,
  Record<EntityId, Record<EntityRevisionId, KnowledgeGraphVertex>>
>;

export type Vertices = Subtype<
  VerticesBp<true>,
  OntologyVertices & KnowledgeGraphVertices
>;
