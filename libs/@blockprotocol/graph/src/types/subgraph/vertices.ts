import type { BaseUrl, validateBaseUrl } from "@blockprotocol/type-system/slim";
import { stringIsNonNegativeInteger } from "../../util.js";
import type {
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityPropertyValue,
  EntityRevisionId,
} from "../entity.js";
import type { OntologyTypeRevisionId } from "../ontology.js";
import type { DataTypeWithMetadata } from "../ontology/data-type.js";
import type { EntityTypeWithMetadata } from "../ontology/entity-type.js";
import type { PropertyTypeWithMetadata } from "../ontology/property-type.js";

export interface DataTypeVertex {
  kind: "dataType";
  inner: DataTypeWithMetadata;
}

export interface PropertyTypeVertex {
  kind: "propertyType";
  inner: PropertyTypeWithMetadata;
}

export interface EntityTypeVertex {
  kind: "entityType";
  inner: EntityTypeWithMetadata;
}

export interface EntityVertex<
  Properties extends EntityPropertiesObject | null = Record<
    BaseUrl,
    EntityPropertyValue
  >,
> {
  kind: "entity";
  inner: Entity<Properties>;
}

export type OntologyVertex =
  | DataTypeVertex
  | PropertyTypeVertex
  | EntityTypeVertex;

export type KnowledgeGraphVertex<
  Properties extends EntityPropertiesObject | null = Record<
    BaseUrl,
    EntityPropertyValue
  >,
> = EntityVertex<Properties>;

export type Vertex<
  Properties extends EntityPropertiesObject | null = Record<
    BaseUrl,
    EntityPropertyValue
  >,
> = OntologyVertex | KnowledgeGraphVertex<Properties>;

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

export const isEntityVertex = (vertex: Vertex): vertex is EntityVertex => {
  return vertex.kind === "entity";
};

export interface VertexId<BaseId, RevisionId> {
  baseId: BaseId;
  revisionId: RevisionId;
}
export type EntityVertexId = VertexId<EntityId, EntityRevisionId>;
export type OntologyTypeVertexId = VertexId<BaseUrl, OntologyTypeRevisionId>;
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

export type OntologyVertices = Record<
  BaseUrl,
  Record<OntologyTypeRevisionId, OntologyVertex>
>;

export type KnowledgeGraphVertices = Record<
  EntityId,
  Record<EntityRevisionId, KnowledgeGraphVertex>
>;

// We technically want to intersect (`&`) the types here, but as their property keys overlap it confuses things and we
// end up with unsatisfiable values like `EntityVertex & DataTypeVertex`. While the union (`|`) is semantically
// incorrect, it structurally matches the types we want.
export type Vertices = OntologyVertices | KnowledgeGraphVertices;
