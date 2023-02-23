import {
  type HasLeftEntityEdge as HasLeftEntityEdgeBp,
  type HasRightEntityEdge as HasRightEntityEdgeBp,
  type IncomingLinkEdge as IncomingLinkEdgeBp,
  type IsOfTypeEdge as IsOfTypeEdgeBp,
  type KnowledgeGraphOutwardEdge as KnowledgeGraphOutwardEdgeBp,
  type OutgoingLinkEdge as OutgoingLinkEdgeBp,
  isHasLeftEntityEdge as isHasLeftEntityEdgeBp,
  isHasRightEntityEdge as isHasRightEntityEdgeBp,
  isIncomingLinkEdge as isIncomingLinkEdgeBp,
  isIsOfTypeEdge as isIsOfTypeEdgeBp,
  isOutgoingLinkEdge as isOutgoingLinkEdgeBp,
} from "@blockprotocol/graph/temporal";
import { Subtype } from "@local/advanced-types/subtype";

import { OntologyTypeVertexId } from "../../vertices";
import { GenericOutwardEdge } from "../generic-outward-edge";
import { KnowledgeGraphEdgeKind, SharedEdgeKind } from "../kind";
import { EntityIdWithInterval, OutwardEdge } from "../outward-edge";

export type OutgoingLinkEdge = Subtype<
  OutgoingLinkEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      reversed: true;
      kind: "HAS_LEFT_ENTITY";
      rightEndpoint: EntityIdWithInterval;
    }
  >
>;

export const isOutgoingLinkEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is OutgoingLinkEdge => isOutgoingLinkEdgeBp(outwardEdge);

export type HasLeftEntityEdge = Subtype<
  HasLeftEntityEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      reversed: false;
      kind: "HAS_LEFT_ENTITY";
      rightEndpoint: EntityIdWithInterval;
    }
  >
>;

export const isHasLeftEntityEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is HasLeftEntityEdge => isHasLeftEntityEdgeBp(outwardEdge);

export type HasRightEntityEdge = Subtype<
  HasRightEntityEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      reversed: false;
      kind: "HAS_RIGHT_ENTITY";
      rightEndpoint: EntityIdWithInterval;
    }
  >
>;

export const isHasRightEntityEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is HasRightEntityEdge => isHasRightEntityEdgeBp(outwardEdge);

export type IncomingLinkEdge = Subtype<
  IncomingLinkEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      reversed: true;
      kind: "HAS_RIGHT_ENTITY";
      rightEndpoint: EntityIdWithInterval;
    }
  >
>;

export const isIncomingLinkEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is IncomingLinkEdge => isIncomingLinkEdgeBp(outwardEdge);

export type IsOfTypeEdge = Subtype<
  IsOfTypeEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      reversed: false;
      kind: "IS_OF_TYPE";
      rightEndpoint: OntologyTypeVertexId;
    }
  >
>;

export const isIsOfTypeEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is IsOfTypeEdge => isIsOfTypeEdgeBp(outwardEdge);

export type KnowledgeGraphOutwardEdge = Subtype<
  KnowledgeGraphOutwardEdgeBp,
  | OutgoingLinkEdge
  | IncomingLinkEdge
  | HasLeftEntityEdge
  | HasRightEntityEdge
  | IsOfTypeEdge
>;

/**
 * This provides a sanity check that we've fully expressed all variants for KnowledgeGraphOutward edges. Should a new
 * variant be required (for example by the introduction of a new `SharedEdgeKind`) `tsc` will report an error.
 *
 * This can be affirmed by commenting out one of the edges above
 */
type _CheckKnowledgeGraphOutwardEdge = Subtype<
  KnowledgeGraphOutwardEdge,
  | GenericOutwardEdge<KnowledgeGraphEdgeKind, boolean, EntityIdWithInterval>
  | GenericOutwardEdge<SharedEdgeKind, false, OntologyTypeVertexId>
>;
