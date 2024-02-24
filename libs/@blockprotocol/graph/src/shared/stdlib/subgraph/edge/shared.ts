import {
  BaseUrl,
  extractBaseUrl,
  extractVersion,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import {
  OntologyOutwardEdge,
  OntologyToOntologyOutwardEdge,
  OntologyTypeRevisionId,
  OntologyTypeVertexId,
  OutwardEdge,
  Subgraph,
} from "../../../types/subgraph.js";

/**
 * This is a helper function to extract ontology edges given an `outwardEdgePredicate` function.
 *
 * @internal
 * @param subgraph {Subgraph} - The `Subgraph` containing the underlying ontology types
 * @param ontologyTypeId {OntologyTypeVertexId | VersionedUrl} - The identifier of the `EntityType` to search for
 * @param outwardEdgePredicate {(outwardEdge: OutwardEdge<boolean>) => outwardEdge is OntologyToOntologyOutwardEdge} - The predicate to filter edges by
 * @returns {OntologyTypeVertexId[]} - The resulting endpoints of the filtered edges
 */
export const getOntologyEndpointsForOntologyOutwardEdge = (
  subgraph: Subgraph<boolean>,
  ontologyTypeId: OntologyTypeVertexId | VersionedUrl,
  outwardEdgePredicate: (
    outwardEdge: OutwardEdge<boolean>,
  ) => outwardEdge is OntologyToOntologyOutwardEdge,
): OntologyTypeVertexId[] => {
  let baseUrl: BaseUrl;
  let revisionId: OntologyTypeRevisionId;

  if (typeof ontologyTypeId === "string") {
    baseUrl = extractBaseUrl(ontologyTypeId);
    revisionId = extractVersion(ontologyTypeId).toString();
  } else {
    baseUrl = ontologyTypeId.baseId;
    revisionId = ontologyTypeId.revisionId;
  }

  const outwardEdges = subgraph.edges[baseUrl]?.[
    revisionId
  ] as OntologyOutwardEdge<boolean>[];

  if (outwardEdges === undefined) {
    return [];
  }

  return outwardEdges
    .filter(outwardEdgePredicate)
    .map((outwardEdge) => outwardEdge.rightEndpoint);
};
