import { Subtype } from "../../../../util.js";
import { EntityId } from "../../../entity.js";
import { OntologyTypeVertexId } from "../../vertices.js";
import { GenericOutwardEdge } from "../generic-outward-edge.js";
import { KnowledgeGraphEdgeKind, SharedEdgeKind } from "../kind.js";
import { EntityIdWithInterval, OutwardEdge } from "../outward-edge.js";

export type OutgoingLinkEdge<Temporal extends boolean> = Subtype<
  GenericOutwardEdge,
  {
    reversed: true;
    kind: "HAS_LEFT_ENTITY";
    rightEndpoint: Temporal extends true ? EntityIdWithInterval : EntityId;
  }
>;

export const isOutgoingLinkEdge = <Temporal extends boolean>(
  outwardEdge: OutwardEdge<Temporal>,
): outwardEdge is OutgoingLinkEdge<Temporal> => {
  return outwardEdge.kind === "HAS_LEFT_ENTITY" && outwardEdge.reversed;
};

export type HasLeftEntityEdge<Temporal extends boolean> = Subtype<
  GenericOutwardEdge,
  {
    reversed: false;
    kind: "HAS_LEFT_ENTITY";
    rightEndpoint: Temporal extends true ? EntityIdWithInterval : EntityId;
  }
>;

export const isHasLeftEntityEdge = <Temporal extends boolean>(
  outwardEdge: OutwardEdge<Temporal>,
): outwardEdge is HasLeftEntityEdge<Temporal> => {
  return outwardEdge.kind === "HAS_LEFT_ENTITY" && !outwardEdge.reversed;
};

export type HasRightEntityEdge<Temporal extends boolean> = Subtype<
  GenericOutwardEdge,
  {
    reversed: false;
    kind: "HAS_RIGHT_ENTITY";
    rightEndpoint: Temporal extends true ? EntityIdWithInterval : EntityId;
  }
>;

export const isHasRightEntityEdge = <Temporal extends boolean>(
  outwardEdge: OutwardEdge<Temporal>,
): outwardEdge is HasRightEntityEdge<Temporal> => {
  return outwardEdge.kind === "HAS_RIGHT_ENTITY" && !outwardEdge.reversed;
};

export type IncomingLinkEdge<Temporal extends boolean> = Subtype<
  GenericOutwardEdge,
  {
    reversed: true;
    kind: "HAS_RIGHT_ENTITY";
    rightEndpoint: Temporal extends true ? EntityIdWithInterval : EntityId;
  }
>;

export const isIncomingLinkEdge = <Temporal extends boolean>(
  outwardEdge: OutwardEdge<Temporal>,
): outwardEdge is IncomingLinkEdge<Temporal> => {
  return outwardEdge.kind === "HAS_RIGHT_ENTITY" && outwardEdge.reversed;
};

export type IsOfTypeEdge = Subtype<
  GenericOutwardEdge,
  {
    reversed: false;
    kind: "IS_OF_TYPE";
    rightEndpoint: OntologyTypeVertexId;
  }
>;

export const isIsOfTypeEdge = (
  outwardEdge: OutwardEdge<boolean>,
): outwardEdge is IsOfTypeEdge => {
  return outwardEdge.kind === "IS_OF_TYPE" && !outwardEdge.reversed;
};

export type KnowledgeGraphOutwardEdge<Temporal extends boolean> =
  | OutgoingLinkEdge<Temporal>
  | IncomingLinkEdge<Temporal>
  | HasLeftEntityEdge<Temporal>
  | HasRightEntityEdge<Temporal>
  | IsOfTypeEdge;

/**
 * This provides a sanity check that we've fully expressed all variants for KnowledgeGraphOutward edges. Should a new
 * variant be required (for example by the introduction of a new `SharedEdgeKind`) `tsc` will report an error.
 *
 * This can be affirmed by commenting out one of the edges above
 */
type _CheckKnowledgeGraphOutwardEdgeTemporal = Subtype<
  KnowledgeGraphOutwardEdge<true>,
  | GenericOutwardEdge<KnowledgeGraphEdgeKind, boolean, EntityIdWithInterval>
  | GenericOutwardEdge<SharedEdgeKind, false, OntologyTypeVertexId>
>;
type _CheckKnowledgeGraphOutwardEdge = Subtype<
  KnowledgeGraphOutwardEdge<false>,
  | GenericOutwardEdge<KnowledgeGraphEdgeKind, boolean, EntityId>
  | GenericOutwardEdge<SharedEdgeKind, false, OntologyTypeVertexId>
>;
