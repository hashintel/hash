import type {
  OntologyTypeVersion,
  Timestamp,
} from "@blockprotocol/type-system";

import type { KnowledgeGraphOutwardEdge } from "./edges/variants/knowledge.js";
import type { OntologyOutwardEdge } from "./edges/variants/ontology.js";

export * from "./edges/kind.js";
export * from "./edges/outward-edge.js";
export * from "./edges/variants.js";

export type OntologyRootedEdges = {
  [baseUrl: string]: {
    [revisionId: OntologyTypeVersion]: OntologyOutwardEdge[];
  };
};

export type KnowledgeGraphRootedEdges = {
  [entityId: string]: {
    [revisionId: Timestamp]: KnowledgeGraphOutwardEdge[];
  };
};

// We technically want to intersect (`&`) the types here, but as their property keys overlap it confuses things and we
// end up with unsatisfiable values like `EntityVertex & DataTypeVertex`. While the union (`|`) is semantically
// incorrect, it structurally matches the types we want.
export type Edges = OntologyRootedEdges | KnowledgeGraphRootedEdges;
