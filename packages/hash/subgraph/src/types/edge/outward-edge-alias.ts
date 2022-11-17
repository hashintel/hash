/**
 * A collection of 'aliases' which describe various variants of outward edges in more accessible-forms
 */
import { KnowledgeGraphOutwardEdge } from "../edge";
import { EntityIdAndTimestamp } from "../identifier";

/** @todo - is there a way to have TS force us to make this always satisfy `KnowledgeGraphOutwardEdge`? */
export type HasLinkEdge = {
  reversed: true;
  kind: "HAS_LEFT_ENDPOINT";
  endpoint: EntityIdAndTimestamp;
};

export const isHasLinkEdge = (
  outwardEdge: KnowledgeGraphOutwardEdge,
): outwardEdge is HasLinkEdge => {
  return outwardEdge.kind === "HAS_LEFT_ENDPOINT" && outwardEdge.reversed;
};

/** @todo - is there a way to have TS force us to make this always satisfy `KnowledgeGraphOutwardEdge`? */
export type HasRightEndpointEdge = {
  reversed: false;
  kind: "HAS_RIGHT_ENDPOINT";
  endpoint: EntityIdAndTimestamp;
};

export const isHasRightEndpointEdge = (
  outwardEdge: KnowledgeGraphOutwardEdge,
): outwardEdge is HasRightEndpointEdge => {
  return outwardEdge.kind === "HAS_RIGHT_ENDPOINT" && !outwardEdge.reversed;
};

/** @todo - is there a way to have TS force us to make this always satisfy `KnowledgeGraphOutwardEdge`? */
export type HasIncomingDirectedLinkEdge = {
  reversed: true;
  kind: "HAS_RIGHT_ENDPOINT";
  endpoint: EntityIdAndTimestamp;
};

export const isHasIncomingDirectedLinkEdge = (
  outwardEdge: KnowledgeGraphOutwardEdge,
): outwardEdge is HasRightEndpointEdge => {
  return outwardEdge.kind === "HAS_RIGHT_ENDPOINT" && outwardEdge.reversed;
};
