import { Subgraph as SubgraphBp } from "@blockprotocol/graph/temporal";
import { getPropertyTypesReferencedByEntityType as getPropertyTypesReferencedByEntityTypeBp } from "@blockprotocol/graph/temporal/stdlib";
import { VersionedUri } from "@blockprotocol/type-system/slim";

import { OntologyTypeVertexId, Subgraph } from "../../../main";

/**
 * Gets identifiers for all `PropertyType`s referenced within a given `EntityType` schema by searching for
 * "ConstrainsPropertiesOn" `Edge`s from the respective `Vertex` within a `Subgraph`.
 *
 * @param subgraph {Subgraph} - The `Subgraph` containing the type tree of the `EntityType`
 * @param entityTypeId {OntologyTypeVertexId | VersionedUri} - The identifier of the `EntityType` to search for
 * @returns {OntologyTypeVertexId[]} - The identifiers of the `PropertyType`s referenced from the `EntityType`
 */
export const getPropertyTypesReferencedByEntityType = (
  subgraph: Subgraph,
  entityTypeId: OntologyTypeVertexId | VersionedUri,
): OntologyTypeVertexId[] =>
  getPropertyTypesReferencedByEntityTypeBp(
    subgraph as unknown as SubgraphBp,
    entityTypeId,
  ) as OntologyTypeVertexId[];
