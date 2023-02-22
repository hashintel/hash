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
} from "@blockprotocol/graph/temporal";
import { Subtype } from "@local/advanced-types/subtype";

import {
  DataTypeWithMetadata,
  Entity,
  EntityPropertiesObject,
  EntityPropertyValue,
  EntityRevisionId,
  EntityTypeWithMetadata,
  OntologyTypeRevisionId,
  PropertyTypeWithMetadata,
} from "../element";
import { BaseUri, EntityId } from "../shared";

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
  {
    [baseUri: BaseUri]: {
      [revisionId: OntologyTypeRevisionId]: OntologyVertex;
    };
  }
>;

export type KnowledgeGraphVertices = Subtype<
  KnowledgeGraphVerticesBp<true>,
  {
    [entityId: EntityId]: {
      [revisionId: EntityRevisionId]: KnowledgeGraphVertex;
    };
  }
>;

export type Vertices = OntologyVertices & KnowledgeGraphVertices;

/**
 * This provides a sanity check that we've almost correctly expressed `Vertices` as a subtype of the Block Protocol one.
 *
 * We unfortunately need these two different types because in the Block Protocol we had to use `|` instead of `&` due
 * to overlapping index types. We _wanted_ to use `&` but it produces unsatisfiable types. However, because we have
 * branded types here (thus the index types do not overlap) we can do better in HASH and use `&`, although this confuses
 * TypeScript and it thinks they are incompatible. Thus, the strange check type.
 */
export type _CheckVertices = Subtype<
  VerticesBp<true>,
  OntologyVertices | KnowledgeGraphVertices
>;
