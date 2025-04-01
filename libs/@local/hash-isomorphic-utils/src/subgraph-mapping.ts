import type {
  ActorEntityUuid,
  BaseUrl,
  ClosedEntityType,
  ClosedMultiEntityType,
  DataTypeWithMetadata,
  EntityId,
  EntityTypeWithMetadata,
  OwnedById,
  PropertyObject,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  extractOwnedByIdFromEntityId,
  isEntityId,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  ClosedEntityType as GraphApiClosedEntityType,
  ClosedMultiEntityType as GraphApiClosedMultiEntityType,
  DataTypeConversionTargets as GraphApiDataTypeConversionTargets,
  DataTypeWithMetadata as GraphApiDataTypeWithMetadata,
  Entity as GraphApiEntity,
  EntityTypeResolveDefinitions as GraphApiEntityTypeResolveDefinitions,
  EntityTypeWithMetadata as GraphApiEntityTypeWithMetadata,
  KnowledgeGraphVertex as KnowledgeGraphVertexGraphApi,
  PropertyTypeWithMetadata as GraphApiPropertyTypeWithMetadata,
  Subgraph as GraphApiSubgraph,
  Vertices as VerticesGraphApi,
} from "@local/hash-graph-client";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityProperties } from "@local/hash-graph-types/entity";
import type {
  DataTypeConversionTargets,
  EntityTypeResolveDefinitions,
} from "@local/hash-graph-types/ontology";
import type {
  KnowledgeGraphVertex,
  SerializedKnowledgeGraphVertex,
  SerializedSubgraph,
  SerializedVertices,
  Subgraph,
  SubgraphRootType,
  Vertices,
} from "@local/hash-subgraph";
import { isEntityVertex } from "@local/hash-subgraph";

import { systemEntityTypes, systemPropertyTypes } from "./ontology-type-ids.js";

const restrictedPropertyBaseUrls: string[] = [
  systemPropertyTypes.email.propertyTypeBaseUrl,
];

export const mapGraphApiEntityToEntity = <T extends EntityProperties>(
  entity: GraphApiEntity,
  userAccountId: ActorEntityUuid | null,
  preserveProperties = false,
) =>
  new Entity<T>({
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
                userAccountId &&
                (userAccountId as string as OwnedById) === ownedById;

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
  userAccountId: ActorEntityUuid | null,
  preserveProperties = false,
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
  userAccountId: ActorEntityUuid | null,
  preserveProperties = false,
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
  userAccountId: ActorEntityUuid | null,
  preserveProperties = false,
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

export const mapGraphApiEntityTypesToEntityTypes = (
  entityTypes: GraphApiEntityTypeWithMetadata[],
) => entityTypes as EntityTypeWithMetadata[];

export const mapGraphApiClosedEntityTypesToClosedEntityTypes = (
  closedEntityTypes: GraphApiClosedEntityType[],
) => closedEntityTypes as ClosedEntityType[];

export const mapGraphApiEntityTypeResolveDefinitionsToEntityTypeResolveDefinitions =
  (entityTypeResolveDefinitions: GraphApiEntityTypeResolveDefinitions) =>
    entityTypeResolveDefinitions as EntityTypeResolveDefinitions;

export const mapGraphApiClosedMultiEntityTypesToClosedMultiEntityTypes = (
  closedMultiEntityTypes: GraphApiClosedMultiEntityType[],
) => closedMultiEntityTypes as ClosedMultiEntityType[];

export const mapGraphApiPropertyTypesToPropertyTypes = (
  propertyTypes: GraphApiPropertyTypeWithMetadata[],
) => propertyTypes as PropertyTypeWithMetadata[];

export const mapGraphApiDataTypesToDataTypes = (
  dataTypes: GraphApiDataTypeWithMetadata[],
) => dataTypes as DataTypeWithMetadata[];

export const mapGraphApiDataTypeConversions = (
  conversions: Record<
    string,
    Record<string, GraphApiDataTypeConversionTargets>
  >,
) =>
  conversions as Record<
    VersionedUrl,
    Record<VersionedUrl, DataTypeConversionTargets>
  >;
