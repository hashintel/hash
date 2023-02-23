import {
  type Edges as EdgesBp,
  type KnowledgeGraphRootedEdges as KnowledgeGraphRootedEdgesBp,
  type OntologyRootedEdges as OntologyRootedEdgesBp,
} from "@blockprotocol/graph/temporal";
import { Subtype } from "@local/advanced-types/subtype";

import { OntologyTypeRevisionId } from "../element";
import { BaseUri, EntityId, Timestamp } from "../shared";
import {
  KnowledgeGraphOutwardEdge,
  OntologyOutwardEdge,
} from "./edges/variants";

export * from "./edges/kind";
export * from "./edges/outward-edge";
export * from "./edges/variants";

export type OntologyRootedEdges = Subtype<
  OntologyRootedEdgesBp,
  {
    [baseUri: BaseUri]: {
      [revisionId: OntologyTypeRevisionId]: OntologyOutwardEdge[];
    };
  }
>;

export type KnowledgeGraphRootedEdges = Subtype<
  KnowledgeGraphRootedEdgesBp,
  {
    [entityId: EntityId]: {
      [fromTime: Timestamp]: KnowledgeGraphOutwardEdge[];
    };
  }
>;

export type Edges = OntologyRootedEdges & KnowledgeGraphRootedEdges;
/**
 * This provides a sanity check that we've almost correctly expressed `Edges` as a subtype of the Block Protocol one.
 *
 * We unfortunately need these two different types because in the Block Protocol we had to use `|` instead of `&` due
 * to overlapping index types. We _wanted_ to use `&` but it produces unsatisfiable types. However, because we have
 * branded types here (thus the index types do not overlap) we can do better in HASH and use `&`, although this confuses
 * TypeScript and it thinks they are incompatible. Thus, the strange check type.
 */
export type _CheckEdges = Subtype<
  EdgesBp,
  OntologyRootedEdges | KnowledgeGraphRootedEdges
>;
