import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  Entity as GraphApiEntity,
  EntityMetadata as GraphApiEntityMetadata,
  KnowledgeGraphVertex as KnowledgeGraphVertexGraphApi,
  Subgraph as GraphApiSubgraph,
  Vertices as VerticesGraphApi,
} from "@local/hash-graph-client";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  AccountId,
  BaseUrl,
  Entity,
  EntityId,
  EntityMetadata,
  EntityPropertiesObject,
  KnowledgeGraphVertex,
  Subgraph,
  SubgraphRootType,
  Vertices,
} from "@local/hash-subgraph";
import { extractOwnedByIdFromEntityId, isEntityId } from "@local/hash-subgraph";

/**
 * A mapping function that can be used to map entity metadata returned by the Graph API to the HASH `EntityMetadata`
 * definition.
 */
export const mapGraphApiEntityMetadataToMetadata = (
  metadata: GraphApiEntityMetadata,
) => {
  if (metadata.entityTypeIds.length !== 1) {
    throw new Error(
      `Expected entity metadata to have exactly one entity type id, but got ${metadata.entityTypeIds.length}`,
    );
  }
  return {
    recordId: metadata.recordId,
    entityTypeId: metadata.entityTypeIds[0],
    temporalVersioning: metadata.temporalVersioning,
    provenance: metadata.provenance,
    archived: metadata.archived,
  } as EntityMetadata;
};

const restrictedPropertyBaseUrls: string[] = [
  systemPropertyTypes.email.propertyTypeBaseUrl,
  systemPropertyTypes.automaticInferenceConfiguration.propertyTypeBaseUrl,
  systemPropertyTypes.manualInferenceConfiguration.propertyTypeBaseUrl,
];

export const mapGraphApiEntityToEntity = (
  entity: GraphApiEntity,
  userAccountId: AccountId | null,
  preserveProperties: boolean = false,
) => {
  return {
    ...entity,
    /**
     * Until cell-level permissions is implemented (H-814), remove user properties that shouldn't be generally visible
     */
    properties:
      preserveProperties ||
      !entity.metadata.entityTypeIds.includes(
        systemEntityTypes.user.entityTypeId,
      )
        ? entity.properties
        : Object.entries(entity.properties).reduce<EntityPropertiesObject>(
            (acc, [key, value]) => {
              const ownedById = extractOwnedByIdFromEntityId(
                entity.metadata.recordId.entityId as EntityId,
              );

              const requesterOwnsEntity =
                userAccountId && userAccountId === ownedById;

              if (
                !restrictedPropertyBaseUrls.includes(key) ||
                requesterOwnsEntity
              ) {
                acc[key as BaseUrl] = value;
              }
              return acc;
            },
            {} as EntityPropertiesObject,
          ),
    metadata: mapGraphApiEntityMetadataToMetadata(entity.metadata),
  } as Entity;
};

const mapKnowledgeGraphVertex = (
  vertex: KnowledgeGraphVertexGraphApi,
  userAccountId: AccountId | null,
  preserveProperties: boolean = false,
) => {
  return {
    kind: vertex.kind,
    inner: mapGraphApiEntityToEntity(
      vertex.inner,
      userAccountId,
      preserveProperties,
    ),
  } as KnowledgeGraphVertex;
};

export const mapGraphApiVerticesToVertices = (
  vertices: VerticesGraphApi,
  userAccountId: AccountId | null,
  preserveProperties: boolean = false,
) =>
  Object.fromEntries(
    typedEntries(vertices).map(([baseId, inner]) => [
      baseId,
      isEntityId(baseId)
        ? Object.fromEntries(
            typedEntries(inner).map(([version, vertex]) => [
              version,
              mapKnowledgeGraphVertex(
                vertex as KnowledgeGraphVertexGraphApi,
                userAccountId,
                preserveProperties,
              ),
            ]),
          )
        : inner,
    ]),
  ) as Vertices;

/**
 * A mapping function that can be used to map the subgraph returned by the Graph API to the HASH `Subgraph` definition.
 *
 * @param subgraph
 * @param userAccountId the user making the request, to determine visibility of certain properties. 'null' if
 *   unauthenticated
 * @param preserveProperties don't filter out protected properties – for admins or internal-only processes
 */
export const mapGraphApiSubgraphToSubgraph = <
  RootType extends SubgraphRootType,
>(
  subgraph: GraphApiSubgraph,
  userAccountId: AccountId | null,
  preserveProperties: boolean = false,
) => {
  return {
    ...subgraph,
    vertices: mapGraphApiVerticesToVertices(
      subgraph.vertices,
      userAccountId,
      preserveProperties,
    ),
  } as Subgraph<RootType>;
};
