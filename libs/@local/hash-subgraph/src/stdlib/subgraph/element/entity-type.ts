import { type Subgraph as SubgraphBp } from "@blockprotocol/graph/temporal";
import {
  getEntityTypeById as getEntityTypeByIdBp,
  getEntityTypeByVertexId as getEntityTypeByVertexIdBp,
  getEntityTypes as getEntityTypesBp,
  getEntityTypesByBaseUrl as getEntityTypesByBaseUrlBp,
} from "@blockprotocol/graph/temporal/stdlib";
import { VersionedUrl } from "@blockprotocol/type-system/slim";

import {
  BaseUrl,
  EntityTypeWithMetadata,
  OntologyTypeVertexId,
  Subgraph,
} from "../../../main";

/**
 * Returns all `EntityTypeWithMetadata`s within the vertices of the subgraph
 *
 * @param subgraph
 */
export const getEntityTypes = (subgraph: Subgraph): EntityTypeWithMetadata[] =>
  getEntityTypesBp(
    subgraph as unknown as SubgraphBp,
  ) as EntityTypeWithMetadata[];

/**
 * Gets an `EntityTypeWithMetadata` by its `VersionedUrl` from within the vertices of the subgraph. Returns `undefined`
 * if the entity type couldn't be found.
 *
 * @param subgraph
 * @param entityTypeId
 * @throws if the vertex isn't a `EntityTypeVertex`
 */
export const getEntityTypeById = (
  subgraph: Subgraph,
  entityTypeId: VersionedUrl,
): EntityTypeWithMetadata | undefined =>
  getEntityTypeByIdBp(subgraph as unknown as SubgraphBp, entityTypeId) as
    | EntityTypeWithMetadata
    | undefined;

/**
 * Gets a `EntityTypeWithMetadata` by its `OntologyTypeVertexId` from within the vertices of the subgraph. Returns
 * `undefined` if the entity type couldn't be found.
 *
 * @param subgraph
 * @param vertexId
 * @throws if the vertex isn't a `EntityTypeVertex`
 */
export const getEntityTypeByVertexId = (
  subgraph: Subgraph,
  vertexId: OntologyTypeVertexId,
): EntityTypeWithMetadata | undefined =>
  getEntityTypeByVertexIdBp(subgraph as unknown as SubgraphBp, vertexId) as
    | EntityTypeWithMetadata
    | undefined;

/**
 * Returns all `EntityTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUrl`
 *
 * @param subgraph
 * @param baseUrl
 */
export const getEntityTypesByBaseUrl = (
  subgraph: Subgraph,
  baseUrl: BaseUrl,
): EntityTypeWithMetadata[] =>
  getEntityTypesByBaseUrlBp(
    subgraph as unknown as SubgraphBp,
    baseUrl,
  ) as EntityTypeWithMetadata[];
