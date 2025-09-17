import {
  isEntityVertex,
  type KnowledgeGraphVertex,
  type Subgraph,
  type SubgraphRootType,
  type Vertices,
} from "@blockprotocol/graph";
import type {
  ActorEntityUuid,
  BaseUrl,
  EntityId,
  PropertyObject,
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
  Entity as GraphApiEntity,
  KnowledgeGraphVertex as GraphApiKnowledgeGraphVertex,
  PropertyObjectMetadata as GraphApiPropertyObjectMetadata,
  Subgraph as GraphApiSubgraph,
  Vertices as GraphApiVertices,
} from "@local/hash-graph-client";

import {
  HashEntity,
  type SerializedKnowledgeGraphVertex,
  type SerializedVertices,
} from "./entity.js";

const restrictedPropertyBaseUrls: string[] = [
  "https://hash.ai/@h/types/property-type/email/",
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
  (Object.entries(properties) as [BaseUrl, T[keyof T]][]).reduce<T>(
    (acc, [key, value]) => {
      const webId = extractWebIdFromEntityId(
        entity.metadata.recordId.entityId as EntityId,
      );

      const requesterOwnsEntity =
        userAccountId && (userAccountId as string as WebId) === webId;

      if (!restrictedPropertyBaseUrls.includes(key) || requesterOwnsEntity) {
        acc[key as keyof T] = value;
      }
      return acc;
    },
    {} as T,
  );

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
          "https://hash.ai/@h/types/entity-type/user/",
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
          "https://hash.ai/@hash/types/entity-type/user/",
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
  vertex: GraphApiKnowledgeGraphVertex,
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

export const mapGraphApiVerticesToVertices = (
  vertices: GraphApiVertices,
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
                vertex as GraphApiKnowledgeGraphVertex,
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
  userAccountId: ActorEntityUuid | null,
  preserveProperties = false,
): Subgraph<RootType, HashEntity> => {
  return {
    ...subgraph,
    vertices: mapGraphApiVerticesToVertices(
      subgraph.vertices,
      userAccountId,
      preserveProperties,
    ),
  } as Subgraph<RootType, HashEntity>;
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
