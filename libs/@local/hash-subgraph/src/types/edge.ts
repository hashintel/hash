import { BaseUri } from "@blockprotocol/type-system";

import { EntityId } from "./branded";
import {
  EntityIdAndTimestamp,
  EntityVertexId,
  isEntityVertexId,
  isOntologyTypeRecordId,
  OntologyTypeRecordId,
  Timestamp,
} from "./identifier";

// -------------------------------- Edge Kinds --------------------------------

const ONTOLOGY_EDGE_KINDS = [
  "INHERITS_FROM",
  "CONSTRAINS_VALUES_ON",
  "CONSTRAINS_PROPERTIES_ON",
  "CONSTRAINS_LINKS_ON",
  "CONSTRAINS_LINK_DESTINATIONS_ON",
] as const;
const KNOWLEDGE_GRAPH_EDGE_KIND = [
  "HAS_LEFT_ENTITY",
  "HAS_RIGHT_ENTITY",
] as const;
const SHARED_EDGE_KIND = ["IS_OF_TYPE"] as const;

export type OntologyEdgeKind = (typeof ONTOLOGY_EDGE_KINDS)[number];
export type KnowledgeGraphEdgeKind = (typeof KNOWLEDGE_GRAPH_EDGE_KIND)[number];
export type SharedEdgeKind = (typeof SHARED_EDGE_KIND)[number];

export const isOntologyEdgeKind = (kind: string): kind is OntologyEdgeKind => {
  return (ONTOLOGY_EDGE_KINDS as ReadonlyArray<string>).includes(kind);
};

export const isKnowledgeGraphEdgeKind = (
  kind: string,
): kind is KnowledgeGraphEdgeKind => {
  return (KNOWLEDGE_GRAPH_EDGE_KIND as ReadonlyArray<string>).includes(kind);
};

export const isSharedEdgeKind = (kind: string): kind is SharedEdgeKind => {
  return (SHARED_EDGE_KIND as ReadonlyArray<string>).includes(kind);
};

// -------------------------------- Outward Edges --------------------------------

/**
 * A "partial" definition of an edge which is complete when joined with the missing left-endpoint (usually the source
 * of the edge)
 */
type GenericOutwardEdge<K, E> = {
  kind: K;
  reversed: boolean;
  rightEndpoint: E;
};

export type OntologyOutwardEdge =
  | GenericOutwardEdge<OntologyEdgeKind, OntologyTypeRecordId>
  | GenericOutwardEdge<SharedEdgeKind, EntityVertexId>;

export type KnowledgeGraphOutwardEdge =
  | GenericOutwardEdge<KnowledgeGraphEdgeKind, EntityIdAndTimestamp>
  | GenericOutwardEdge<SharedEdgeKind, OntologyTypeRecordId>;

export type OutwardEdge = OntologyOutwardEdge | KnowledgeGraphOutwardEdge;

export const isOntologyOutwardEdge = (
  edge: OutwardEdge,
): edge is OntologyOutwardEdge => {
  return (
    isOntologyEdgeKind(edge.kind) ||
    (isSharedEdgeKind(edge.kind) && isEntityVertexId(edge.rightEndpoint))
  );
};

export const isKnowledgeGraphOutwardEdge = (
  edge: OutwardEdge,
): edge is KnowledgeGraphOutwardEdge => {
  return (
    isKnowledgeGraphEdgeKind(edge.kind) ||
    (isSharedEdgeKind(edge.kind) && isOntologyTypeRecordId(edge.rightEndpoint))
  );
};

// -------------------------------- The `Edges` type --------------------------------

export type Edges = {
  [_: BaseUri]: {
    [_: number]: OntologyOutwardEdge[];
  };
} & {
  [_: EntityId]: {
    [_: Timestamp]: KnowledgeGraphOutwardEdge[];
  };
};
