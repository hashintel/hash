import {
  type KnowledgeGraphEdgeKind as KnowledgeGraphEdgeKindBp,
  type OntologyEdgeKind as OntologyEdgeKindBp,
  type SharedEdgeKind as SharedEdgeKindBp,
  isKnowledgeGraphEdgeKind as isKnowledgeGraphEdgeKindBp,
  isOntologyEdgeKind as isOntologyEdgeKindBp,
  isSharedEdgeKind as isSharedEdgeKindBp,
} from "@blockprotocol/graph/temporal";

export type OntologyEdgeKind = OntologyEdgeKindBp;

export type KnowledgeGraphEdgeKind = KnowledgeGraphEdgeKindBp;

export type SharedEdgeKind = SharedEdgeKindBp;

// -------------------------------- Type Guards --------------------------------

export const isOntologyEdgeKind = isOntologyEdgeKindBp;

export const isKnowledgeGraphEdgeKind = isKnowledgeGraphEdgeKindBp;

export const isSharedEdgeKind = isSharedEdgeKindBp;
