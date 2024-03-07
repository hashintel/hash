import { Subtype } from "../../../../util.js";
import { EntityId } from "../../../entity.js";
import { OntologyTypeVertexId } from "../../vertices.js";
import { GenericOutwardEdge } from "../generic-outward-edge.js";
import { OntologyEdgeKind, SharedEdgeKind } from "../kind.js";
import { EntityIdWithInterval, OutwardEdge } from "../outward-edge.js";

export type InheritsFromEdge = Subtype<
  GenericOutwardEdge,
  {
    kind: "INHERITS_FROM";
    reversed: false;
    rightEndpoint: OntologyTypeVertexId;
  }
>;

export const isInheritsFromEdge = (
  outwardEdge: OutwardEdge<boolean>,
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
  outwardEdge: OutwardEdge<boolean>,
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
  outwardEdge: OutwardEdge<boolean>,
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
  outwardEdge: OutwardEdge<boolean>,
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
  outwardEdge: OutwardEdge<boolean>,
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
  outwardEdge: OutwardEdge<boolean>,
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
  outwardEdge: OutwardEdge<boolean>,
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
  outwardEdge: OutwardEdge<boolean>,
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
  outwardEdge: OutwardEdge<boolean>,
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
  outwardEdge: OutwardEdge<boolean>,
): outwardEdge is LinkDestinationsConstrainedByEdge => {
  return (
    outwardEdge.kind === "CONSTRAINS_LINK_DESTINATIONS_ON" &&
    outwardEdge.reversed
  );
};

export type IsTypeOfEdge<Temporal extends boolean> = Subtype<
  GenericOutwardEdge,
  {
    reversed: true;
    kind: "IS_OF_TYPE";
    rightEndpoint: Temporal extends true ? EntityIdWithInterval : EntityId;
  }
>;

export const isIsTypeOfEdge = <Temporal extends boolean>(
  outwardEdge: OutwardEdge<Temporal>,
): outwardEdge is IsTypeOfEdge<Temporal> => {
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

export type OntologyOutwardEdge<Temporal extends boolean> =
  | OntologyToOntologyOutwardEdge
  | IsTypeOfEdge<Temporal>;

/**
 * This provides a sanity check that we've fully expressed all variants for OntologyOutwardEdge edges. Should a new
 * variant be required (for example by the introduction of a new `SharedEdgeKind`) `tsc` will report an error.
 *
 * This can be affirmed by commenting out one of the edges above
 */
type _CheckOntologyOutwardEdgeTemporal = Subtype<
  OntologyOutwardEdge<true>,
  | GenericOutwardEdge<OntologyEdgeKind, boolean, OntologyTypeVertexId>
  | GenericOutwardEdge<SharedEdgeKind, true, EntityIdWithInterval>
>;
type _CheckOntologyOutwardEdge = Subtype<
  OntologyOutwardEdge<false>,
  | GenericOutwardEdge<OntologyEdgeKind, boolean, OntologyTypeVertexId>
  | GenericOutwardEdge<SharedEdgeKind, true, EntityId>
>;
