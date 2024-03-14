import type { Subgraph as SubgraphBp } from "@blockprotocol/graph/temporal";
import {
  getRoots as getRootsBp,
  isDataTypeRootedSubgraph as isDataTypeRootedSubgraphBp,
  isEntityRootedSubgraph as isEntityRootedSubgraphBp,
  isEntityTypeRootedSubgraph as isEntityTypeRootedSubgraphBp,
  isPropertyTypeRootedSubgraph as isPropertyTypeRootedSubgraphBp,
} from "@blockprotocol/graph/temporal/stdlib";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  Entity as GraphApiEntity,
  EntityMetadata as GraphApiEntityMetadata,
  KnowledgeGraphVertex as KnowledgeGraphVertexGraphApi,
  Subgraph as GraphApiSubgraph,
  Vertices as VerticesGraphApi,
} from "@local/hash-graph-client";

import type {
  DataTypeRootType,
  Entity,
  EntityMetadata,
  EntityRootType,
  EntityTypeRootType,
  KnowledgeGraphVertex,
  PropertyTypeRootType,
  Subgraph,
  SubgraphRootType,
  Vertices,
} from "../../main";
import { isEntityId } from "../../main";

/**
 * Returns all root elements.
 *
 * For a narrower return type, first narrow the type of `subgraph` by using one of the helper type-guards:
 * - {@link isDataTypeRootedSubgraph}
 * - {@link isPropertyTypeRootedSubgraph}
 * - {@link isEntityTypeRootedSubgraph}
 * - {@link isEntityRootedSubgraph}
 *
 * @param subgraph
 */
export const getRoots = <RootType extends SubgraphRootType>(
  subgraph: Subgraph<RootType>,
): RootType["element"][] =>
  getRootsBp(subgraph as unknown as SubgraphBp<RootType>);

/**
 * A type-guard that can be used to constrain the generic parameter of `Subgraph` to `DataTypeWithMetadata`.
 *
 * Doing so will help TS infer that `getRoots` returns `DataTypeWithMetadata`s, removing the need for additional
 * type checks or casts.
 *
 * @param subgraph
 */
export const isDataTypeRootedSubgraph = (
  subgraph: Subgraph,
): subgraph is Subgraph<DataTypeRootType> =>
  isDataTypeRootedSubgraphBp(subgraph as unknown as SubgraphBp);

/**
 * A type assertion that can be used to assert the generic of `Subgraph` to `DataTypeWithMetadata`.
 *
 * @param subgraph
 */
export const assertDataTypeRootedSubgraph: (
  subgraph: Subgraph,
) => asserts subgraph is Subgraph<DataTypeRootType> = (subgraph) => {
  if (!isDataTypeRootedSubgraph(subgraph)) {
    throw new Error("Expected subgraph to be an data type rooted subgraph");
  }
};

/**
 * A type-guard that can be used to constrain the generic parameter of `Subgraph` to `PropertyTypeWithMetadata`.
 *
 * Doing so will help TS infer that `getRoots` returns `PropertyTypeWithMetadata`s, removing the need for additional
 * type checks or casts.
 *
 * @param subgraph
 */
export const isPropertyTypeRootedSubgraph = (
  subgraph: Subgraph,
): subgraph is Subgraph<PropertyTypeRootType> =>
  isPropertyTypeRootedSubgraphBp(subgraph as unknown as SubgraphBp);

/**
 * A type assertion that can be used to assert the generic of `Subgraph` to `PropertyTypeWithMetadata`.
 *
 * @param subgraph
 */
export const assertPropertyTypeRootedSubgraph: (
  subgraph: Subgraph,
) => asserts subgraph is Subgraph<PropertyTypeRootType> = (subgraph) => {
  if (!isPropertyTypeRootedSubgraph(subgraph)) {
    throw new Error("Expected subgraph to be an property type rooted subgraph");
  }
};

/**
 * A type-guard that can be used to constrain the generic parameter of `Subgraph` to `EntityTypeWithMetadata`.
 *
 * Doing so will help TS infer that `getRoots` returns `EntityTypeWithMetadata`s, removing the need for additional
 * type checks or casts.
 *
 * @param subgraph
 */
export const isEntityTypeRootedSubgraph = (
  subgraph: Subgraph,
): subgraph is Subgraph<EntityTypeRootType> =>
  isEntityTypeRootedSubgraphBp(subgraph as unknown as SubgraphBp);

/**
 * A type assertion that can be used to assert the generic of `Subgraph` to `EntityTypeWithMetadata`.
 *
 * @param subgraph
 */
export const assertEntityTypeRootedSubgraph: (
  subgraph: Subgraph,
) => asserts subgraph is Subgraph<EntityTypeRootType> = (subgraph) => {
  if (!isEntityTypeRootedSubgraph(subgraph)) {
    throw new Error("Expected subgraph to be an entity type rooted subgraph");
  }
};

/**
 * A type-guard that can be used to constrain the generic parameter of `Subgraph` to `Entity`.
 *
 * Doing so will help TS infer that `getRoots` returns `Entity`s, removing the need for additional
 * type checks or casts.
 *
 * @param subgraph
 */
export const isEntityRootedSubgraph = (
  subgraph: Subgraph,
): subgraph is Subgraph<EntityRootType> =>
  isEntityRootedSubgraphBp(subgraph as unknown as SubgraphBp);

/**
 * A type assertion that can be used to assert the generic of `Subgraph` to `Entity`.
 *
 * @param subgraph
 */
export const assertEntityRootedSubgraph: (
  subgraph: Subgraph,
) => asserts subgraph is Subgraph<EntityRootType> = (subgraph) => {
  if (!isEntityRootedSubgraph(subgraph)) {
    throw new Error("Expected subgraph to be an entity rooted subgraph");
  }
};

/**
 * A mapping function that can be used to map entity metadata returned by the Graph API to the HASH `EntityMetadata` definition.
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

export const mapGraphApiEntityToEntity = (entity: GraphApiEntity) => {
  return {
    ...entity,
    metadata: mapGraphApiEntityMetadataToMetadata(entity.metadata),
  } as Entity;
};

const mapKnowledgeGraphVertex = (vertex: KnowledgeGraphVertexGraphApi) => {
  return {
    kind: vertex.kind,
    inner: mapGraphApiEntityToEntity(vertex.inner),
  } as KnowledgeGraphVertex;
};

export const mapGraphApiVerticesToVertices = (vertices: VerticesGraphApi) =>
  Object.fromEntries(
    typedEntries(vertices).map(([baseId, inner]) => [
      baseId,
      isEntityId(baseId)
        ? Object.fromEntries(
            typedEntries(inner).map(([version, vertex]) => [
              version,
              mapKnowledgeGraphVertex(vertex as KnowledgeGraphVertexGraphApi),
            ]),
          )
        : inner,
    ]),
  ) as Vertices;

/**
 * A mapping function that can be used to map the subgraph returned by the Graph API to the HASH `Subgraph` definition.
 *
 * @param subgraph
 */
export const mapGraphApiSubgraphToSubgraph = <
  RootType extends SubgraphRootType,
>(
  subgraph: GraphApiSubgraph,
) => {
  return {
    ...subgraph,
    vertices: mapGraphApiVerticesToVertices(subgraph.vertices),
  } as Subgraph<RootType>;
};
