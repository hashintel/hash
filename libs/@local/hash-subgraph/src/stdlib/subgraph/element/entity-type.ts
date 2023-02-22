import { type Subgraph as SubgraphBp } from "@blockprotocol/graph/temporal";
import {
  getEntityTypeById as getEntityTypeByIdBp,
  getEntityTypeByVertexId as getEntityTypeByVertexIdBp,
  getEntityTypes as getEntityTypesBp,
  getEntityTypesByBaseUri as getEntityTypesByBaseUriBp,
} from "@blockprotocol/graph/temporal/stdlib";
import { VersionedUri } from "@blockprotocol/type-system/slim";

import {
  BaseUri,
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
    subgraph as unknown as SubgraphBp<true>,
  ) as EntityTypeWithMetadata[];

/**
 * Gets an `EntityTypeWithMetadata` by its `VersionedUri` from within the vertices of the subgraph. Returns `undefined`
 * if the entity type couldn't be found.
 *
 * @param subgraph
 * @param entityTypeId
 * @throws if the vertex isn't a `EntityTypeVertex`
 */
export const getEntityTypeById = (
  subgraph: Subgraph,
  entityTypeId: VersionedUri,
): EntityTypeWithMetadata | undefined =>
  getEntityTypeByIdBp(subgraph as unknown as SubgraphBp<true>, entityTypeId) as
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
  getEntityTypeByVertexIdBp(
    subgraph as unknown as SubgraphBp<true>,
    vertexId,
  ) as EntityTypeWithMetadata | undefined;

/**
 * Returns all `EntityTypeWithMetadata`s within the vertices of the subgraph that match a given `BaseUri`
 *
 * @param subgraph
 * @param baseUri
 */
export const getEntityTypesByBaseUri = (
  subgraph: Subgraph,
  baseUri: BaseUri,
): EntityTypeWithMetadata[] =>
  getEntityTypesByBaseUriBp(
    subgraph as unknown as SubgraphBp<true>,
    baseUri,
  ) as EntityTypeWithMetadata[];
