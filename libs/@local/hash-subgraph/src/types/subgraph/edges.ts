import {
  type Edges as EdgesBp,
  type KnowledgeGraphRootedEdges as KnowledgeGraphRootedEdgesBp,
  type OntologyRootedEdges as OntologyRootedEdgesBp,
} from "@blockprotocol/graph";
import { BaseUri } from "@blockprotocol/type-system/slim";
import { Subtype } from "@local/advanced-types/subtype";

import { OntologyTypeRevisionId } from "../element";
import { EntityId, Timestamp } from "../shared";
import {
  KnowledgeGraphOutwardEdge,
  OntologyOutwardEdge,
} from "./edges/variants";

export * from "./edges/kind";
export * from "./edges/outward-edge";
export * from "./edges/variants";

export type OntologyRootedEdges = Subtype<
  OntologyRootedEdgesBp,
  Record<BaseUri, Record<OntologyTypeRevisionId, OntologyOutwardEdge[]>>
>;

export type KnowledgeGraphRootedEdges = Subtype<
  KnowledgeGraphRootedEdgesBp,
  Record<EntityId, Record<Timestamp, KnowledgeGraphOutwardEdge[]>>
>;

export type Edges = Subtype<
  EdgesBp,
  OntologyRootedEdges & KnowledgeGraphRootedEdges
>;
