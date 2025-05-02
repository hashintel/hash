import type {
  BaseUrl,
  DataTypeWithMetadata,
  Entity,
  EntityId,
  EntityTypeWithMetadata,
  OntologyTypeVersion,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import { validateBaseUrl } from "@blockprotocol/type-system";

import { stringIsNonNegativeInteger } from "../../util.js";
import type { EntityRevisionId } from "../entity.js";

export type DataTypeVertex = {
  kind: "dataType";
  inner: DataTypeWithMetadata;
};

export type PropertyTypeVertex = {
  kind: "propertyType";
  inner: PropertyTypeWithMetadata;
};

export type EntityTypeVertex = {
  kind: "entityType";
  inner: EntityTypeWithMetadata;
};

export type EntityVertex<EntityImpl extends Entity = Entity> = {
  kind: "entity";
  inner: EntityImpl;
};

export type OntologyVertex =
  | DataTypeVertex
  | PropertyTypeVertex
  | EntityTypeVertex;

export type KnowledgeGraphVertex<EntityImpl extends Entity = Entity> =
  EntityVertex<EntityImpl>;

export type Vertex<EntityImpl extends Entity = Entity> =
  | OntologyVertex
  | KnowledgeGraphVertex<EntityImpl>;

export const isDataTypeVertex = (vertex: Vertex): vertex is DataTypeVertex => {
  return vertex.kind === "dataType";
};

export const isPropertyTypeVertex = (
  vertex: Vertex,
): vertex is PropertyTypeVertex => {
  return vertex.kind === "propertyType";
};

export const isEntityTypeVertex = (
  vertex: Vertex,
): vertex is EntityTypeVertex => {
  return vertex.kind === "entityType";
};

export const isEntityVertex = <EntityImpl extends Entity>(
  vertex: Vertex<EntityImpl>,
): vertex is EntityVertex<EntityImpl> => {
  return vertex.kind === "entity";
};

export type VertexId<BaseId, RevisionId> = {
  baseId: BaseId;
  revisionId: RevisionId;
};
export type EntityVertexId = VertexId<EntityId, EntityRevisionId>;
export type OntologyTypeVertexId = VertexId<BaseUrl, OntologyTypeVersion>;
export type GraphElementVertexId = EntityVertexId | OntologyTypeVertexId;

export const isOntologyTypeVertexId = (
  vertexId: unknown,
): vertexId is OntologyTypeVertexId => {
  return (
    vertexId != null &&
    typeof vertexId === "object" &&
    "baseId" in vertexId &&
    typeof vertexId.baseId === "string" &&
    validateBaseUrl(vertexId.baseId).type === "Ok" &&
    "revisionId" in vertexId &&
    typeof vertexId.revisionId === "string" &&
    stringIsNonNegativeInteger(vertexId.revisionId)
  );
};

export const isEntityVertexId = (
  vertexId: unknown,
): vertexId is EntityVertexId => {
  return (
    vertexId != null &&
    typeof vertexId === "object" &&
    "baseId" in vertexId &&
    "revisionId" in vertexId &&
    /** @todo - is it fine to just check that versionId is string, maybe timestamp if we want to lock it into being a
     *    timestamp?
     */
    !isOntologyTypeVertexId(vertexId)
  );
};

export type OntologyVertices = {
  /** Branding the keys causes too much complication with accessing the vertices. */
  [baseUrl: string]: {
    [revisionId: string]: OntologyVertex;
  };
};

export type KnowledgeGraphEditionMap<EntityImpl extends Entity = Entity> = {
  [revisionId: EntityRevisionId]: KnowledgeGraphVertex<EntityImpl>;
};

export type KnowledgeGraphVertices<EntityImpl extends Entity = Entity> = {
  /** Branding the keys causes too much complication with accessing the vertices. */
  [entityId: string]: KnowledgeGraphEditionMap<EntityImpl>;
};

export const isKnowledgeGraphVertex = <EntityImpl extends Entity>(
  vertex: OntologyVertex | KnowledgeGraphVertex<EntityImpl>,
): vertex is KnowledgeGraphVertex<EntityImpl> => vertex.kind === "entity";

export const isOntologyVertex = (
  vertex: OntologyVertex | KnowledgeGraphVertex,
): vertex is OntologyVertex => !isKnowledgeGraphVertex(vertex);

// We technically want to intersect (`&`) the types here, but as their property keys overlap it confuses things and we
// end up with unsatisfiable values like `EntityVertex & DataTypeVertex`. While the union (`|`) is semantically
// incorrect, it structurally matches the types we want.
export type Vertices<EntityImpl extends Entity = Entity> =
  | OntologyVertices
  | KnowledgeGraphVertices<EntityImpl>;
