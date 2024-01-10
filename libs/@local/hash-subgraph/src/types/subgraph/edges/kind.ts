import {
  type KnowledgeGraphEdgeKind as KnowledgeGraphEdgeKindBp,
  type OntologyEdgeKind as OntologyEdgeKindBp,
  type SharedEdgeKind as SharedEdgeKindBp,
} from "@blockprotocol/graph/temporal";
import * as temporal from "@blockprotocol/graph/temporal";

export type OntologyEdgeKind = OntologyEdgeKindBp;

export type KnowledgeGraphEdgeKind = KnowledgeGraphEdgeKindBp;

export type SharedEdgeKind = SharedEdgeKindBp;

// -------------------------------- Type Guards --------------------------------

export const isOntologyEdgeKind = temporal.isOntologyEdgeKind;

export const isKnowledgeGraphEdgeKind = temporal.isKnowledgeGraphEdgeKind;

export const isSharedEdgeKind = temporal.isSharedEdgeKind;
