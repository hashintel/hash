import type { Subgraph as SubgraphBp } from "@blockprotocol/graph";
import { getPropertyTypesReferencedByEntityType as getPropertyTypesReferencedByEntityTypeBp } from "@blockprotocol/graph/stdlib";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";

import type { OntologyTypeVertexId, Subgraph } from "../../../main.js";

/**
 * Gets identifiers for all `PropertyType`s referenced within a given `EntityType` schema by searching for
 * "ConstrainsPropertiesOn" `Edge`s from the respective `Vertex` within a `Subgraph`.
 *
 * @deprecated Does not take account of inheritance – use `getPropertyTypesForEntityType` instead
 *
 * @param subgraph {Subgraph} - The `Subgraph` containing the type tree of the `EntityType`
 * @param entityTypeId {OntologyTypeVertexId | VersionedUrl} - The identifier of the `EntityType` to search for
 * @returns {OntologyTypeVertexId[]} - The identifiers of the `PropertyType`s referenced from the `EntityType`
 */
export const getPropertyTypesReferencedByEntityType = (
  subgraph: Subgraph,
  entityTypeId: OntologyTypeVertexId | VersionedUrl,
): OntologyTypeVertexId[] =>
  getPropertyTypesReferencedByEntityTypeBp(
    subgraph as unknown as SubgraphBp,
    entityTypeId,
  ) as OntologyTypeVertexId[];
