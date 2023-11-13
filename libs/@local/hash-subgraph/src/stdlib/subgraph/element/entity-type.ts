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
 * Gets an array of `EntityTypeWithMetadata` containing the requested entity type and all its ancestors
 * i.e. entity types it inherits from, whether directly or indirectly.
 *
 * @param subgraph a subgraph containing the entity type and its ancestors
 * @param entityTypeId the `VersionedUrl` of the entity type
 * @throws Error if the entity type or any of its ancestors aren't present in the subgraph
 * @returns EntityTypeWithMetadata[] an array of `EntityTypeWithMetadata`, where the first element is the entity type
 */
export const getEntityTypeAndParentsById = (
  subgraph: Subgraph,
  entityTypeId: VersionedUrl,
): EntityTypeWithMetadata[] => {
  const entityType = getEntityTypeById(subgraph, entityTypeId);

  if (!entityType) {
    throw new Error(`Entity type ${entityTypeId} not found in subgraph`);
  }

  const parentIds = (entityType.schema.allOf ?? []).map(
    (parent) => parent.$ref,
  );

  // Return the entity type, followed by its ancestors
  return [
    entityType,
    ...parentIds.flatMap((parentId) =>
      getEntityTypeAndParentsById(subgraph, parentId),
    ),
  ];
};

/**
 * Gets an array of `EntityTypeWithMetadata` containing the requested entity type and all its descendants
 * i.e. entity types which inherit from it, whether directly or indirectly.
 *
 * @param subgraph a subgraph containing the entity type and its descendants
 * @param entityTypeId the `VersionedUrl` of the entity type
 * @throws Error if the entity type or any of its descendants aren't present in the subgraph
 * @returns EntityTypeWithMetadata[] an array of `EntityTypeWithMetadata`, where the first element is the entity type
 */
export const getEntityTypeAndDescendantsById = (
  subgraph: Subgraph,
  entityTypeId: VersionedUrl,
): EntityTypeWithMetadata[] => {
  const entityType = getEntityTypeById(subgraph, entityTypeId);

  if (!entityType) {
    throw new Error(`Entity type ${entityTypeId} not found in subgraph`);
  }

  const descendants = getEntityTypes(subgraph).filter((type) =>
    (type.schema.allOf ?? []).some((parent) => parent.$ref === entityTypeId),
  );

  // Return the entity type, followed by its ancestors
  return [
    entityType,
    ...descendants.flatMap(({ schema }) =>
      getEntityTypeAndDescendantsById(subgraph, schema.$id),
    ),
  ];
};

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
