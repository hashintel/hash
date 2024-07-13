import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  DataTypeWithMetadata as GraphApiDataTypeWithMetadata,
  Entity as GraphApiEntity,
  EntityTypeWithMetadata as GraphApiEntityTypeWithMetadata,
  KnowledgeGraphVertex as KnowledgeGraphVertexGraphApi,
  PropertyTypeWithMetadata as GraphApiPropertyTypeWithMetadata,
  Subgraph as GraphApiSubgraph,
  Vertices as VerticesGraphApi,
} from "@local/hash-graph-client";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId, PropertyObject } from "@local/hash-graph-types/entity";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  KnowledgeGraphVertex,
  SerializedKnowledgeGraphVertex,
  SerializedSubgraph,
  SerializedVertices,
  Subgraph,
  SubgraphRootType,
  Vertices,
} from "@local/hash-subgraph";
import {
  extractOwnedByIdFromEntityId,
  isEntityId,
  isEntityVertex,
} from "@local/hash-subgraph";

const restrictedPropertyBaseUrls: string[] = [
  systemPropertyTypes.email.propertyTypeBaseUrl,
];

export const mapGraphApiEntityToEntity = (
  entity: GraphApiEntity,
  userAccountId: AccountId | null,
  preserveProperties: boolean = false,
) =>
  new Entity({
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
        : Object.entries(entity.properties).reduce<PropertyObject>(
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
            {} as PropertyObject,
          ),
  });

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

const serializeKnowledgeGraphVertex = (vertex: KnowledgeGraphVertex) => {
  return {
    kind: vertex.kind,
    inner: vertex.inner.toJSON(),
  } as SerializedKnowledgeGraphVertex;
};

const deserializeKnowledgeGraphVertex = (
  vertex: SerializedKnowledgeGraphVertex,
) => {
  return {
    kind: vertex.kind,
    inner: new Entity(vertex.inner),
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

export const serializeGraphVertices = (vertices: Vertices) =>
  Object.fromEntries(
    typedEntries(vertices).map(([baseId, inner]) => [
      baseId,
      Object.fromEntries(
        typedEntries(inner).map(([version, vertex]) => [
          version,
          isEntityVertex(vertex)
            ? serializeKnowledgeGraphVertex(vertex)
            : vertex,
        ]),
      ),
    ]),
  ) as SerializedVertices;

export const deserializeGraphVertices = (vertices: SerializedVertices) =>
  Object.fromEntries(
    typedEntries(vertices).map(([baseId, inner]) => [
      baseId,
      Object.fromEntries(
        typedEntries(inner).map(([version, vertex]) => [
          version,
          vertex.kind === "entity"
            ? deserializeKnowledgeGraphVertex(vertex)
            : vertex,
        ]),
      ),
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

export const serializeSubgraph = (subgraph: Subgraph): SerializedSubgraph => ({
  roots: subgraph.roots,
  vertices: serializeGraphVertices(subgraph.vertices),
  edges: subgraph.edges,
  depths: subgraph.depths,
  temporalAxes: subgraph.temporalAxes,
});

export const deserializeSubgraph = <RootType extends SubgraphRootType>(
  subgraph: SerializedSubgraph,
): Subgraph<RootType> => ({
  roots: subgraph.roots,
  vertices: deserializeGraphVertices(subgraph.vertices),
  edges: subgraph.edges,
  depths: subgraph.depths,
  temporalAxes: subgraph.temporalAxes,
});

export const mapGraphApiEntityTypeToEntityType = (
  entityTypes: GraphApiEntityTypeWithMetadata[],
) => entityTypes as EntityTypeWithMetadata[];

export const mapGraphApiPropertyTypeToPropertyType = (
  entityTypes: GraphApiPropertyTypeWithMetadata[],
) => entityTypes as PropertyTypeWithMetadata[];

export const mapGraphApiDataTypeToDataType = (
  entityTypes: GraphApiDataTypeWithMetadata[],
) => entityTypes as DataTypeWithMetadata[];
