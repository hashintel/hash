import type {
  EntityRootType,
  KnowledgeGraphVertex,
  Subgraph,
  SubgraphRootType,
  Vertices,
} from "@blockprotocol/graph";
import { isEntityVertex } from "@blockprotocol/graph";
import type {
  ActorEntityUuid,
  BaseUrl,
  ClosedEntityType,
  ClosedMultiEntityType,
  DataTypeWithMetadata,
  EntityId,
  EntityTypeWithMetadata,
  PropertyObject,
  PropertyTypeWithMetadata,
  TypeIdsAndPropertiesForEntity,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractWebIdFromEntityId,
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
  PropertyObjectMetadata as GraphApiPropertyObjectMetadata,
  PropertyTypeWithMetadata as GraphApiPropertyTypeWithMetadata,
  Subgraph as GraphApiSubgraph,
  Vertices as VerticesGraphApi,
} from "@local/hash-graph-client";
import {
  HashEntity,
  type SerializedKnowledgeGraphVertex,
  type SerializedSubgraph,
  type SerializedVertices,
} from "@local/hash-graph-sdk/entity";
import type {
  DataTypeConversionTargets,
  EntityTypeResolveDefinitions,
} from "@local/hash-graph-sdk/ontology";

import { systemEntityTypes, systemPropertyTypes } from "./ontology-type-ids.js";

const restrictedPropertyBaseUrls: string[] = [
  systemPropertyTypes.email.propertyTypeBaseUrl,
];

const filterProperties = <
  T extends PropertyObject | GraphApiPropertyObjectMetadata["value"],
>({
  properties,
  entity,
  userAccountId,
}: {
  properties: T;
  entity: GraphApiEntity;
  userAccountId: ActorEntityUuid | null;
}): T =>
  Object.entries(properties).reduce<T>((acc, [key, value]) => {
    const webId = extractWebIdFromEntityId(
      entity.metadata.recordId.entityId as EntityId,
    );

    const requesterOwnsEntity =
      userAccountId && (userAccountId as string as WebId) === webId;

    if (!restrictedPropertyBaseUrls.includes(key) || requesterOwnsEntity) {
      acc[key as T extends PropertyObject ? BaseUrl : BaseUrl] = value;
    }
    return acc;
  }, {} as T);

export const mapGraphApiEntityToEntity = <
  T extends TypeIdsAndPropertiesForEntity,
>(
  entity: GraphApiEntity,
  userAccountId: ActorEntityUuid | null,
  preserveProperties = false,
) => {
  return new HashEntity<T>({
    ...entity,
    /**
     * Until cell-level permissions is implemented (H-814), remove user properties that shouldn't be generally visible
     */
    properties:
      preserveProperties ||
      !entity.metadata.entityTypeIds.some(
        (entityTypeId) =>
          extractBaseUrl(entityTypeId as VersionedUrl) ===
          systemEntityTypes.user.entityTypeBaseUrl,
      )
        ? entity.properties
        : filterProperties({
            properties: entity.properties,
            entity,
            userAccountId,
          }),
    metadata:
      preserveProperties ||
      !entity.metadata.entityTypeIds.some(
        (entityTypeId) =>
          extractBaseUrl(entityTypeId as VersionedUrl) ===
          systemEntityTypes.user.entityTypeBaseUrl,
      )
        ? entity.metadata
        : {
            ...entity.metadata,
            properties: {
              ...entity.metadata.properties,
              value: filterProperties<GraphApiPropertyObjectMetadata["value"]>({
                properties: entity.metadata.properties?.value ?? {},
                entity,
                userAccountId,
              }),
            },
          },
  });
};

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

const serializeKnowledgeGraphVertex = (
  vertex: KnowledgeGraphVertex<HashEntity>,
) => {
  return {
    kind: vertex.kind,
    inner: vertex.inner.toJSON(),
  } as SerializedKnowledgeGraphVertex;
};

const deserializeKnowledgeGraphVertex = (
  vertex: SerializedKnowledgeGraphVertex,
): KnowledgeGraphVertex<HashEntity> => {
  return {
    kind: vertex.kind,
    inner: new HashEntity(vertex.inner),
  };
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

export const serializeGraphVertices = (vertices: Vertices<HashEntity>) =>
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

export const deserializeGraphVertices = (
  vertices: SerializedVertices,
): Vertices<HashEntity> =>
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
  ) as Vertices<HashEntity>;

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
): Subgraph<RootType> => {
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
  vertices: serializeGraphVertices(subgraph.vertices as Vertices<HashEntity>),
  edges: subgraph.edges,
  temporalAxes: subgraph.temporalAxes,
});

export const deserializeSubgraph = <
  RootType extends
    | Exclude<SubgraphRootType, EntityRootType>
    | EntityRootType<HashEntity>,
>(
  subgraph: SerializedSubgraph,
): Subgraph<RootType, HashEntity> => ({
  roots: subgraph.roots as RootType["vertexId"][],
  vertices: deserializeGraphVertices(subgraph.vertices),
  edges: subgraph.edges,
  temporalAxes: subgraph.temporalAxes,
});

export const mapGraphApiEntityTypesToEntityTypes = (
  entityTypes: GraphApiEntityTypeWithMetadata[],
) => entityTypes as unknown as EntityTypeWithMetadata[];

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
) => propertyTypes as unknown as PropertyTypeWithMetadata[];

export const mapGraphApiDataTypesToDataTypes = (
  dataTypes: GraphApiDataTypeWithMetadata[],
) => dataTypes as unknown as DataTypeWithMetadata[];

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
