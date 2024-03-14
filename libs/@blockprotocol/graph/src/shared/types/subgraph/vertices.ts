import type { BaseUrl } from "@blockprotocol/type-system/slim";
import { validateBaseUrl } from "@blockprotocol/type-system/slim";

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

export type EntityVertex<
  Temporal extends boolean,
  Properties extends EntityPropertiesObject | null = Record<
    BaseUrl,
    EntityPropertyValue
  >,
> = { kind: "entity"; inner: Entity<Temporal, Properties> };

export type OntologyVertex =
  | DataTypeVertex
  | PropertyTypeVertex
  | EntityTypeVertex;

export type KnowledgeGraphVertex<
  Temporal extends boolean,
  Properties extends EntityPropertiesObject | null = Record<
    BaseUrl,
    EntityPropertyValue
  >,
> = EntityVertex<Temporal, Properties>;

export type Vertex<
  Temporal extends boolean,
  Properties extends EntityPropertiesObject | null = Record<
    BaseUrl,
    EntityPropertyValue
  >,
> = OntologyVertex | KnowledgeGraphVertex<Temporal, Properties>;

export const isDataTypeVertex = (
  vertex: Vertex<boolean>,
): vertex is DataTypeVertex => {
  return vertex.kind === "dataType";
};

export const isPropertyTypeVertex = (
  vertex: Vertex<boolean>,
): vertex is PropertyTypeVertex => {
  return vertex.kind === "propertyType";
};

export const isEntityTypeVertex = (
  vertex: Vertex<boolean>,
): vertex is EntityTypeVertex => {
  return vertex.kind === "entityType";
};

export const isEntityVertex = <Temporal extends boolean>(
  vertex: Vertex<Temporal>,
): vertex is EntityVertex<Temporal> => {
  return vertex.kind === "entity";
};

export type VertexId<BaseId, RevisionId> = {
  baseId: BaseId;
  revisionId: RevisionId;
};
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

export type KnowledgeGraphVertices<Temporal extends boolean> = Record<
  EntityId,
  Record<EntityRevisionId, KnowledgeGraphVertex<Temporal>>
>;

// We technically want to intersect (`&`) the types here, but as their property keys overlap it confuses things and we
// end up with unsatisfiable values like `EntityVertex & DataTypeVertex`. While the union (`|`) is semantically
// incorrect, it structurally matches the types we want.
export type Vertices<Temporal extends boolean> =
  | OntologyVertices
  | KnowledgeGraphVertices<Temporal>;
