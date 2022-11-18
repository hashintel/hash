/**
 * A collection of 'aliases' which describe various variants of outward edges in more accessible-forms
 */
import { KnowledgeGraphOutwardEdge } from "../edge";
import { EntityIdAndTimestamp } from "../identifier";

/** @todo - is there a way to have TS force us to make this always satisfy `KnowledgeGraphOutwardEdge`? */
export type OutwardLinkEdge = {
  reversed: true;
  kind: "HAS_LEFT_ENTITY";
  rightEndpoint: EntityIdAndTimestamp;
};

export const isOutwardLinkEdge = (
  outwardEdge: KnowledgeGraphOutwardEdge,
): outwardEdge is OutwardLinkEdge => {
  return outwardEdge.kind === "HAS_LEFT_ENTITY" && outwardEdge.reversed;
};

/** @todo - is there a way to have TS force us to make this always satisfy `KnowledgeGraphOutwardEdge`? */
export type HasLeftEntityEdge = {
  reversed: false;
  kind: "HAS_RIGHT_ENDPOINT";
  rightEndpoint: EntityIdAndTimestamp;
};

export const isHasLeftEntityEdge = (
  outwardEdge: KnowledgeGraphOutwardEdge,
): outwardEdge is HasLeftEntityEdge => {
  return outwardEdge.kind === "HAS_RIGHT_ENTITY" && !outwardEdge.reversed;
};

/** @todo - is there a way to have TS force us to make this always satisfy `KnowledgeGraphOutwardEdge`? */
export type IncomingLinkEdge = {
  reversed: true;
  kind: "HAS_RIGHT_ENDPOINT";
  rightEndpoint: EntityIdAndTimestamp;
};

export const isIncomingLinkEdge = (
  outwardEdge: KnowledgeGraphOutwardEdge,
): outwardEdge is IncomingLinkEdge => {
  return outwardEdge.kind === "HAS_RIGHT_ENTITY" && outwardEdge.reversed;
};
