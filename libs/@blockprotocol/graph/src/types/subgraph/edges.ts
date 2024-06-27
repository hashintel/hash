import type { BaseUrl } from "@blockprotocol/type-system/slim";

import type { EntityId } from "../entity";
import type { OntologyTypeRevisionId } from "../ontology";
import type { Timestamp } from "../temporal-versioning";
import type { KnowledgeGraphOutwardEdge } from "./edges/variants/knowledge";
import type { OntologyOutwardEdge } from "./edges/variants/ontology";

export * from "./edges/kind";
export * from "./edges/outward-edge";
export * from "./edges/variants";

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
