import type { Subtype } from "../../../../util.js";
import type { OntologyTypeVertexId } from "../../vertices.js";
import type { GenericOutwardEdge } from "../generic-outward-edge.js";
import type { OntologyEdgeKind, SharedEdgeKind } from "../kind.js";
import type { EntityIdWithInterval, OutwardEdge } from "../outward-edge.js";

export type InheritsFromEdge = Subtype<
  GenericOutwardEdge,
  {
    kind: "INHERITS_FROM";
    reversed: false;
    rightEndpoint: OntologyTypeVertexId;
  }
>;

export const isInheritsFromEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is InheritsFromEdge => {
  return outwardEdge.kind === "INHERITS_FROM" && !outwardEdge.reversed;
};

export type IsInheritedByEdge = Subtype<
  GenericOutwardEdge,
  {
    kind: "INHERITS_FROM";
    reversed: true;
    rightEndpoint: OntologyTypeVertexId;
  }
>;

export const isIsInheritedByEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is IsInheritedByEdge => {
  return outwardEdge.kind === "INHERITS_FROM" && outwardEdge.reversed;
};

export type ConstrainsValuesOnEdge = Subtype<
  GenericOutwardEdge,
  {
    kind: "CONSTRAINS_VALUES_ON";
    reversed: false;
    rightEndpoint: OntologyTypeVertexId;
  }
>;

export const isConstrainsValuesOnEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is ConstrainsValuesOnEdge => {
  return outwardEdge.kind === "CONSTRAINS_VALUES_ON" && !outwardEdge.reversed;
};

export type ValuesConstrainedByEdge = Subtype<
  GenericOutwardEdge,
  {
    kind: "CONSTRAINS_VALUES_ON";
    reversed: true;
    rightEndpoint: OntologyTypeVertexId;
  }
>;

export const isValuesConstrainedByEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is ValuesConstrainedByEdge => {
  return outwardEdge.kind === "CONSTRAINS_VALUES_ON" && outwardEdge.reversed;
};

export type ConstrainsPropertiesOnEdge = Subtype<
  GenericOutwardEdge,
  {
    reversed: false;
    kind: "CONSTRAINS_PROPERTIES_ON";
    rightEndpoint: OntologyTypeVertexId;
  }
>;

export const isConstrainsPropertiesOnEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is ConstrainsPropertiesOnEdge => {
  return (
    outwardEdge.kind === "CONSTRAINS_PROPERTIES_ON" && !outwardEdge.reversed
  );
};

export type PropertiesConstrainedByEdge = Subtype<
  GenericOutwardEdge,
  {
    reversed: true;
    kind: "CONSTRAINS_PROPERTIES_ON";
    rightEndpoint: OntologyTypeVertexId;
  }
>;

export const isPropertiesConstrainedByEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is PropertiesConstrainedByEdge => {
  return (
    outwardEdge.kind === "CONSTRAINS_PROPERTIES_ON" && outwardEdge.reversed
  );
};

export type ConstrainsLinksOnEdge = Subtype<
  GenericOutwardEdge,
  {
    reversed: false;
    kind: "CONSTRAINS_LINKS_ON";
    rightEndpoint: OntologyTypeVertexId;
  }
>;

export const isConstrainsLinksOnEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is ConstrainsLinksOnEdge => {
  return outwardEdge.kind === "CONSTRAINS_LINKS_ON" && !outwardEdge.reversed;
};

export type LinksConstrainedByEdge = Subtype<
  GenericOutwardEdge,
  {
    reversed: true;
    kind: "CONSTRAINS_LINKS_ON";
    rightEndpoint: OntologyTypeVertexId;
  }
>;

export const isLinksConstrainedByEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is LinksConstrainedByEdge => {
  return outwardEdge.kind === "CONSTRAINS_LINKS_ON" && outwardEdge.reversed;
};

export type ConstrainsLinkDestinationsOnEdge = Subtype<
  GenericOutwardEdge,
  {
    reversed: false;
    kind: "CONSTRAINS_LINK_DESTINATIONS_ON";
    rightEndpoint: OntologyTypeVertexId;
  }
>;

export const isConstrainsLinkDestinationsOnEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is ConstrainsLinkDestinationsOnEdge => {
  return (
    outwardEdge.kind === "CONSTRAINS_LINK_DESTINATIONS_ON" &&
    !outwardEdge.reversed
  );
};

export type LinkDestinationsConstrainedByEdge = Subtype<
  GenericOutwardEdge,
  {
    reversed: true;
    kind: "CONSTRAINS_LINK_DESTINATIONS_ON";
    rightEndpoint: OntologyTypeVertexId;
  }
>;

export const isLinkDestinationsConstrainedByEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is LinkDestinationsConstrainedByEdge => {
  return (
    outwardEdge.kind === "CONSTRAINS_LINK_DESTINATIONS_ON" &&
    outwardEdge.reversed
  );
};

export type IsTypeOfEdge = Subtype<
  GenericOutwardEdge,
  {
    reversed: true;
    kind: "IS_OF_TYPE";
    rightEndpoint: EntityIdWithInterval;
  }
>;

export const isIsTypeOfEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is IsTypeOfEdge => {
  return outwardEdge.kind === "IS_OF_TYPE" && outwardEdge.reversed;
};

export type OntologyToOntologyOutwardEdge =
  | InheritsFromEdge
  | IsInheritedByEdge
  | ConstrainsValuesOnEdge
  | ValuesConstrainedByEdge
  | ConstrainsPropertiesOnEdge
  | PropertiesConstrainedByEdge
  | ConstrainsLinksOnEdge
  | LinksConstrainedByEdge
  | ConstrainsLinkDestinationsOnEdge
  | LinkDestinationsConstrainedByEdge;

export type OntologyOutwardEdge = OntologyToOntologyOutwardEdge | IsTypeOfEdge;

/**
 * This provides a sanity check that we've fully expressed all variants for OntologyOutwardEdge edges. Should a new
 * variant be required (for example by the introduction of a new `SharedEdgeKind`) `tsc` will report an error.
 *
 * This can be affirmed by commenting out one of the edges above.
 */
type _CheckOntologyOutwardEdge = Subtype<
  OntologyOutwardEdge,
  | GenericOutwardEdge<OntologyEdgeKind, boolean, OntologyTypeVertexId>
  | GenericOutwardEdge<SharedEdgeKind, true, EntityIdWithInterval>
>;
