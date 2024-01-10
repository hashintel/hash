import {
  type ConstrainsLinkDestinationsOnEdge as ConstrainsLinkDestinationsOnEdgeBp,
  type ConstrainsLinksOnEdge as ConstrainsLinksOnEdgeBp,
  type ConstrainsPropertiesOnEdge as ConstrainsPropertiesOnEdgeBp,
  type ConstrainsValuesOnEdge as ConstrainsValuesOnEdgeBp,
  type InheritsFromEdge as InheritsFromEdgeBp,
  type IsInheritedByEdge as IsInheritedByEdgeBp,
  type IsTypeOfEdge as IsTypeOfEdgeBp,
  type LinkDestinationsConstrainedByEdge as LinkDestinationsConstrainedByEdgeBp,
  type LinksConstrainedByEdge as LinksConstrainedByEdgeBp,
  type OntologyOutwardEdge as OntologyOutwardEdgeBp,
  type PropertiesConstrainedByEdge as PropertiesConstrainedByEdgeBp,
  type ValuesConstrainedByEdge as ValuesConstrainedByEdgeBp,
} from "@blockprotocol/graph/temporal";
import * as temporal from "@blockprotocol/graph/temporal";
import type { Subtype } from "@local/advanced-types/subtype";

import type { OntologyTypeVertexId } from "../../vertices";
import type { GenericOutwardEdge } from "../generic-outward-edge";
import type { OntologyEdgeKind, SharedEdgeKind } from "../kind";
import type { EntityIdWithInterval, OutwardEdge } from "../outward-edge";

export type InheritsFromEdge = Subtype<
  InheritsFromEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      kind: "INHERITS_FROM";
      reversed: false;
      rightEndpoint: OntologyTypeVertexId;
    }
  >
>;

export const isInheritsFromEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is InheritsFromEdge => temporal.isInheritsFromEdge(outwardEdge);

export type IsInheritedByEdge = Subtype<
  IsInheritedByEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      kind: "INHERITS_FROM";
      reversed: true;
      rightEndpoint: OntologyTypeVertexId;
    }
  >
>;

export const isIsInheritedByEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is IsInheritedByEdge =>
  temporal.isIsInheritedByEdge(outwardEdge);

export type ConstrainsValuesOnEdge = Subtype<
  ConstrainsValuesOnEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      kind: "CONSTRAINS_VALUES_ON";
      reversed: false;
      rightEndpoint: OntologyTypeVertexId;
    }
  >
>;

export const isConstrainsValuesOnEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is ConstrainsValuesOnEdge =>
  temporal.isConstrainsValuesOnEdge(outwardEdge);

export type ValuesConstrainedByEdge = Subtype<
  ValuesConstrainedByEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      kind: "CONSTRAINS_VALUES_ON";
      reversed: true;
      rightEndpoint: OntologyTypeVertexId;
    }
  >
>;

export const isValuesConstrainedByEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is ValuesConstrainedByEdge =>
  temporal.isValuesConstrainedByEdge(outwardEdge);

export type ConstrainsPropertiesOnEdge = Subtype<
  ConstrainsPropertiesOnEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      reversed: false;
      kind: "CONSTRAINS_PROPERTIES_ON";
      rightEndpoint: OntologyTypeVertexId;
    }
  >
>;

export const isConstrainsPropertiesOnEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is ConstrainsPropertiesOnEdge =>
  temporal.isConstrainsPropertiesOnEdge(outwardEdge);

export type PropertiesConstrainedByEdge = Subtype<
  PropertiesConstrainedByEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      reversed: true;
      kind: "CONSTRAINS_PROPERTIES_ON";
      rightEndpoint: OntologyTypeVertexId;
    }
  >
>;

export const isPropertiesConstrainedByEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is PropertiesConstrainedByEdge =>
  temporal.isPropertiesConstrainedByEdge(outwardEdge);

export type ConstrainsLinksOnEdge = Subtype<
  ConstrainsLinksOnEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      reversed: false;
      kind: "CONSTRAINS_LINKS_ON";
      rightEndpoint: OntologyTypeVertexId;
    }
  >
>;

export const isConstrainsLinksOnEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is ConstrainsLinksOnEdge =>
  temporal.isConstrainsLinksOnEdge(outwardEdge);

export type LinksConstrainedByEdge = Subtype<
  LinksConstrainedByEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      reversed: true;
      kind: "CONSTRAINS_LINKS_ON";
      rightEndpoint: OntologyTypeVertexId;
    }
  >
>;

export const isLinksConstrainedByEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is LinksConstrainedByEdge =>
  temporal.isLinksConstrainedByEdge(outwardEdge);

export type ConstrainsLinkDestinationsOnEdge = Subtype<
  ConstrainsLinkDestinationsOnEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      reversed: false;
      kind: "CONSTRAINS_LINK_DESTINATIONS_ON";
      rightEndpoint: OntologyTypeVertexId;
    }
  >
>;

export const isConstrainsLinkDestinationsOnEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is ConstrainsLinkDestinationsOnEdge =>
  temporal.isConstrainsLinkDestinationsOnEdge(outwardEdge);

export type LinkDestinationsConstrainedByEdge = Subtype<
  LinkDestinationsConstrainedByEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      reversed: true;
      kind: "CONSTRAINS_LINK_DESTINATIONS_ON";
      rightEndpoint: OntologyTypeVertexId;
    }
  >
>;

export const isLinkDestinationsConstrainedByEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is LinkDestinationsConstrainedByEdge =>
  temporal.isLinkDestinationsConstrainedByEdge(outwardEdge);

export type IsTypeOfEdge = Subtype<
  IsTypeOfEdgeBp,
  Subtype<
    GenericOutwardEdge,
    {
      reversed: true;
      kind: "IS_OF_TYPE";
      rightEndpoint: EntityIdWithInterval;
    }
  >
>;

export const isIsTypeOfEdge = (
  outwardEdge: OutwardEdge,
): outwardEdge is IsTypeOfEdge => temporal.isIsTypeOfEdge(outwardEdge);

export type OntologyOutwardEdge = Subtype<
  OntologyOutwardEdgeBp,
  | InheritsFromEdge
  | IsInheritedByEdge
  | ConstrainsValuesOnEdge
  | ValuesConstrainedByEdge
  | ConstrainsPropertiesOnEdge
  | PropertiesConstrainedByEdge
  | ConstrainsLinksOnEdge
  | LinksConstrainedByEdge
  | ConstrainsLinkDestinationsOnEdge
  | LinkDestinationsConstrainedByEdge
  | IsTypeOfEdge
>;

/**
 * This provides a sanity check that we've fully expressed all variants for OntologyOutwardEdge edges. Should a new
 * variant be required (for example by the introduction of a new `SharedEdgeKind`) `tsc` will report an error.
 *
 * This can be affirmed by commenting out one of the edges above
 */
type _CheckOntologyOutwardEdge = Subtype<
  OntologyOutwardEdge,
  | GenericOutwardEdge<OntologyEdgeKind, boolean, OntologyTypeVertexId>
  | GenericOutwardEdge<SharedEdgeKind, true, EntityIdWithInterval>
>;
