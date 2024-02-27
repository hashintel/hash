import { VersionedUrl } from "@blockprotocol/type-system/slim";

import {
  isConstrainsPropertiesOnEdge,
  isConstrainsValuesOnEdge,
  OntologyTypeVertexId,
  Subgraph,
} from "../../../types/subgraph.js";
import { getOntologyEndpointsForOntologyOutwardEdge } from "./shared.js";

/**
 * Gets identifiers for all `PropertyType`s referenced within a given `PropertyType` schema by searching for
 * "ConstrainsPropertiesOn" `Edge`s from the respective `Vertex` within a `Subgraph`.
 *
 * @param subgraph {Subgraph} - The `Subgraph` containing the type tree of the `PropertyType`
 * @param propertyTypeId {OntologyTypeVertexId | VersionedUrl} - The identifier of the `PropertyType` to search for
 * @returns {OntologyTypeVertexId[]} - The identifiers of the `PropertyType`s referenced from the `EntityType`
 */
export const getPropertyTypesReferencedByPropertyType = (
  subgraph: Subgraph<boolean>,
  propertyTypeId: OntologyTypeVertexId | VersionedUrl,
): OntologyTypeVertexId[] =>
  getOntologyEndpointsForOntologyOutwardEdge(
    subgraph,
    propertyTypeId,
    isConstrainsPropertiesOnEdge,
  );

/**
 * Gets identifiers for all `DataType`s referenced within a given `PropertyType` schema by searching for
 * "ConstrainsValuesOn" `Edge`s from the respective `Vertex` within a `Subgraph`.
 *
 * @param subgraph {Subgraph} - The `Subgraph` containing the type tree of the `PropertyType`
 * @param propertyTypeId {OntologyTypeVertexId | VersionedUrl} - The identifier of the `PropertyType` to search for
 * @returns {OntologyTypeVertexId[]} - The identifiers of the `DataType`s referenced from the `PropertyType`
 */
export const getDataTypesReferencedByPropertyType = (
  subgraph: Subgraph<boolean>,
  propertyTypeId: OntologyTypeVertexId | VersionedUrl,
): OntologyTypeVertexId[] =>
  getOntologyEndpointsForOntologyOutwardEdge(
    subgraph,
    propertyTypeId,
    isConstrainsValuesOnEdge,
  );
