import type { BaseUrl } from "@blockprotocol/type-system/slim";

import type { EntityId } from "../entity.js";
import type { OntologyTypeRevisionId } from "../ontology.js";
import type { Timestamp } from "../temporal-versioning.js";
import type { KnowledgeGraphOutwardEdge } from "./edges/variants/knowledge.js";
import type { OntologyOutwardEdge } from "./edges/variants/ontology.js";

export * from "./edges/kind.js";
export * from "./edges/outward-edge.js";
export * from "./edges/variants.js";

export type OntologyRootedEdges = Record<
  BaseUrl,
  Record<OntologyTypeRevisionId, OntologyOutwardEdge[]>
>;

export type KnowledgeGraphRootedEdges = Record<
  EntityId,
  Record<Timestamp, KnowledgeGraphOutwardEdge[]>
>;

// We technically want to intersect (`&`) the types here, but as their property keys overlap it confuses things and we
// end up with unsatisfiable values like `EntityVertex & DataTypeVertex`. While the union (`|`) is semantically
// incorrect, it structurally matches the types we want.
export type Edges = OntologyRootedEdges | KnowledgeGraphRootedEdges;
