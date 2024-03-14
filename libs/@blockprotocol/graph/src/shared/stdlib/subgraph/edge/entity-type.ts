import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  extractBaseUrl,
  extractVersion,
} from "@blockprotocol/type-system/slim";

import type {
  OntologyOutwardEdge,
  OntologyTypeRevisionId,
  OntologyTypeVertexId,
  Subgraph,
} from "../../../types/subgraph.js";
import {
  isConstrainsLinkDestinationsOnEdge,
  isConstrainsLinksOnEdge,
  isConstrainsPropertiesOnEdge,
  isInheritsFromEdge,
} from "../../../types/subgraph.js";
import { getOntologyEndpointsForOntologyOutwardEdge } from "./shared.js";

/**
 * Gets identifiers for all `PropertyType`s referenced within a given `EntityType` schema by searching for
 * "ConstrainsPropertiesOn" `Edge`s from the respective `Vertex` within a `Subgraph`.
 *
 * @param subgraph {Subgraph} - The `Subgraph` containing the type tree of the `EntityType`
 * @param entityTypeId {OntologyTypeVertexId | VersionedUrl} - The identifier of the `EntityType` to search for
 * @returns {OntologyTypeVertexId[]} - The identifiers of the `PropertyType`s referenced from the `EntityType`
 */
export const getPropertyTypesReferencedByEntityType = (
  subgraph: Subgraph<boolean>,
  entityTypeId: OntologyTypeVertexId | VersionedUrl,
): OntologyTypeVertexId[] =>
  getOntologyEndpointsForOntologyOutwardEdge(
    subgraph,
    entityTypeId,
    isConstrainsPropertiesOnEdge,
  );

type EntityTypeReferences = {
  inheritsFrom: OntologyTypeVertexId[];
  constrainsLinksOn: OntologyTypeVertexId[];
  constrainsLinkDestinationsOn: OntologyTypeVertexId[];
};

/**
 * Gets identifiers for all `EntityType`s referenced within a given `EntityType` schema by searching for
 * "InheritsFrom", "ConstrainsLinksOn" and "ConstrainsLinkDestinationsOn" `Edge`s from the respective `Vertex` within a `Subgraph`.
 *
 * @param subgraph {Subgraph} - The `Subgraph` containing the type tree of the `EntityType`
 * @param entityTypeId {OntologyTypeVertexId | VersionedUrl} - The identifier of the `EntityType` to search for
 * @returns {EntityTypeReferences} - The identifiers of the `EntityType`s referenced from the `EntityType` grouped by their edge kind
 */
export const getEntityTypesReferencedByEntityType = (
  subgraph: Subgraph<boolean>,
  entityTypeId: OntologyTypeVertexId | VersionedUrl,
): EntityTypeReferences => {
  let baseUrl: BaseUrl;
  let revisionId: OntologyTypeRevisionId;

  if (typeof entityTypeId === "string") {
    baseUrl = extractBaseUrl(entityTypeId);
    revisionId = extractVersion(entityTypeId).toString();
  } else {
    baseUrl = entityTypeId.baseId;
    revisionId = entityTypeId.revisionId;
  }

  const outwardEdges = subgraph.edges[baseUrl]?.[revisionId] as
    | OntologyOutwardEdge<boolean>[]
    | undefined;

  const ontologyVertexIds = {
    inheritsFrom: [],
    constrainsLinksOn: [],
    constrainsLinkDestinationsOn: [],
  };

  if (outwardEdges === undefined) {
    return ontologyVertexIds;
  }

  return outwardEdges.reduce<EntityTypeReferences>((acc, outwardEdge) => {
    if (isInheritsFromEdge(outwardEdge)) {
      acc.inheritsFrom.push(outwardEdge.rightEndpoint);
    } else if (isConstrainsLinksOnEdge(outwardEdge)) {
      acc.constrainsLinksOn.push(outwardEdge.rightEndpoint);
    } else if (isConstrainsLinkDestinationsOnEdge(outwardEdge)) {
      acc.constrainsLinkDestinationsOn.push(outwardEdge.rightEndpoint);
    }
    return acc;
  }, ontologyVertexIds);
};
