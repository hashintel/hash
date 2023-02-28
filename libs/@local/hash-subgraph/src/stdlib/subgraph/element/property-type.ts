import { Subgraph as SubgraphBp } from "@blockprotocol/graph/temporal";
import {
  getPropertyTypeById as getPropertyTypeByIdBp,
  getPropertyTypeByVertexId as getPropertyTypeByVertexIdBp,
  getPropertyTypes as getPropertyTypesBp,
  getPropertyTypesByBaseUrl as getPropertyTypesByBaseUrlBp,
} from "@blockprotocol/graph/temporal/stdlib";
import { VersionedUrl } from "@blockprotocol/type-system/slim";

import {
  BaseUrl,
  OntologyTypeVertexId,
  PropertyTypeWithMetadata,
  Subgraph,
} from "../../../main";

/**
 * Returns all `PropertyTypeWithMetadata`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getPropertyTypes = (
  subgraph: Subgraph,
): PropertyTypeWithMetadata[] =>
  getPropertyTypesBp(
    subgraph as unknown as SubgraphBp,
  ) as PropertyTypeWithMetadata[];

/**
 * Gets a `PropertyTypeWithMetadata` by its `VersionedUrl` from within the vertices of the subgraph. Returns `undefined`
 * if the property type couldn't be found.
 *
 * @param subgraph
 * @param propertyTypeId
 * @throws if the vertex isn't a `PropertyTypeVertex`
 */
export const getPropertyTypeById = (
  subgraph: Subgraph,
  propertyTypeId: VersionedUrl,
): PropertyTypeWithMetadata | undefined =>
  getPropertyTypeByIdBp(subgraph as unknown as SubgraphBp, propertyTypeId) as
    | PropertyTypeWithMetadata
    | undefined;

/**
 * Gets a `PropertyTypeWithMetadata` by its `OntologyTypeVertexId` from within the vertices of the subgraph. Returns
 * `undefined` if the property type couldn't be found.
 *
 * @param subgraph
 * @param vertexId
 * @throws if the vertex isn't a `PropertyTypeVertex`
 */
export const getPropertyTypeByVertexId = (
  subgraph: Subgraph,
  vertexId: OntologyTypeVertexId,
): PropertyTypeWithMetadata | undefined =>
  getPropertyTypeByVertexIdBp(subgraph as unknown as SubgraphBp, vertexId) as
    | PropertyTypeWithMetadata
    | undefined;

/**
 * Returns all `PropertyTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUrl`
 *
 * @param subgraph
 * @param baseUrl
 */
export const getPropertyTypesByBaseUrl = (
  subgraph: Subgraph,
  baseUrl: BaseUrl,
): PropertyTypeWithMetadata[] =>
  getPropertyTypesByBaseUrlBp(
    subgraph as unknown as SubgraphBp,
    baseUrl,
  ) as PropertyTypeWithMetadata[];
